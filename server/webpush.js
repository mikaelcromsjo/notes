const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const webpush = require('web-push');
const db = require('./db');

// VAPID keypair is generated once and persisted next to the DB so push
// subscriptions stay valid across restarts.
const keyPath = path.join(__dirname, '..', 'data', 'vapid.json');

let keys;
try {
  keys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
} catch {
  keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(keyPath, JSON.stringify(keys, null, 2));
}

const CONTACT = process.env.VAPID_CONTACT || 'mailto:notes@localhost';
webpush.setVapidDetails(CONTACT, keys.publicKey, keys.privateKey);

const listForUser = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
const deleteByEndpoint = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

// --- SSRF guard for push endpoints -----------------------------------------
// A subscription endpoint is a URL the server will later POST to from inside
// the network, so a client must not be able to aim it at localhost, link-local
// metadata services, or RFC1918 hosts.
function isPrivateAddr(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    let s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('fe80:') || s.startsWith('fc') || s.startsWith('fd')) return true;
    const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // v4-mapped
    if (m) return isPrivateAddr(m[1]);
    return false;
  }
  return true; // unparseable → treat as unsafe
}

function endpointHostIssue(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'not a URL';
  }
  if (url.protocol !== 'https:') return 'must be https';
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return 'host not allowed';
  }
  if (net.isIP(host) && isPrivateAddr(host)) return 'host not allowed';
  return null;
}

// Full check (DNS-resolves the host). Use at subscribe time.
async function assertSafeEndpoint(raw) {
  const issue = endpointHostIssue(raw);
  if (issue) return issue;
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return null; // already range-checked above
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    return 'host does not resolve';
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddr(a.address))) return 'host not allowed';
  return null;
}

// Push `payload` (an object) to every registered endpoint for a user. Dead
// endpoints (404/410) are pruned. Never throws.
async function sendToUser(userId, payload) {
  const subs = listForUser.all(userId);
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      // Re-check at send time: guards against a row that predates validation or
      // a hostname that has since been re-pointed at an internal address.
      if (endpointHostIssue(s.endpoint)) {
        deleteByEndpoint.run(s.endpoint);
        return;
      }
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(sub, body);
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          deleteByEndpoint.run(s.endpoint);
        } else {
          console.error('web push failed:', err && err.statusCode, err && err.body);
        }
      }
    })
  );
}

module.exports = { publicKey: keys.publicKey, sendToUser, assertSafeEndpoint };
