// The app's single way to ask Claude something. For now it runs the `claude`
// CLI on the box owner's subscription (notes.service runs as devuser, who is
// logged in) — swap this file's body for @anthropic-ai/sdk + ANTHROPIC_API_KEY
// when going live; callers only see ask().
//
// Safety: the CLI is started with every tool disabled (`--tools ""`), no MCP,
// no settings and a replaced system prompt, so text inside a user's image can
// at most change the answer — it can never run a command or read a file.
const { spawn } = require('child_process');
const os = require('os');

const MAX_PARALLEL = 2; // each CLI process is a few hundred MB of RAM
let running = 0;
const waiting = [];

function slot() {
  if (running < MAX_PARALLEL) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

// ask({ system, prompt, images: [{ mediaType, data: Buffer }], schema, model, timeoutMs })
// -> the parsed structured output when `schema` is given, else the reply text.
async function ask({ system, prompt, images = [], schema, model = 'sonnet', timeoutMs = 180000 }) {
  await slot();
  try {
    return await runCli({ system, prompt, images, schema, model, timeoutMs });
  } finally {
    release();
  }
}

function runCli({ system, prompt, images, schema, model, timeoutMs }) {
  const args = [
    '-p', '--verbose',
    '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--tools', '', '--strict-mcp-config', '--setting-sources', '',
    '--no-session-persistence', '--model', model,
  ];
  if (system) args.push('--system-prompt', system);
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  const env = { ...process.env, IS_SANDBOX: '1' };
  delete env.ANTHROPIC_API_KEY; // subscription, never an accidental API bill

  const message = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        ...images.map((im) => ({
          type: 'image',
          source: { type: 'base64', media_type: im.mediaType, data: im.data.toString('base64') },
        })),
        { type: 'text', text: prompt },
      ],
    },
  });

  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { env, cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let stderr = '';
    let result = null;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    // stream-json with --verbose echoes the input (base64 images included),
    // so read line by line and keep only the result line.
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.includes('"type":"result"')) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'result') result = obj;
        } catch { /* not a full JSON line */ }
      }
    });
    child.stderr.on('data', (d) => { if (stderr.length < 2000) stderr += d; });
    child.on('error', (err) => { clearTimeout(timer); reject(new Error(`claude: ${err.message}`)); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) return reject(new Error('claude: timed out'));
      if (!result) return reject(new Error(`claude: exited ${code}: ${stderr.slice(0, 300)}`));
      if (result.is_error) return reject(new Error(`claude: ${String(result.result).slice(0, 300)}`));
      if (schema) {
        if (result.structured_output) return resolve(result.structured_output);
        try {
          return resolve(JSON.parse(result.result));
        } catch {
          return reject(new Error('claude: no structured output'));
        }
      }
      resolve(String(result.result || '').trim());
    });
    child.stdin.end(message + '\n');
  });
}

module.exports = { ask };
