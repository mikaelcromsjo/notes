# Domain 6 — Monetization & Plan Gating

## 1. Goal

Turn the app into a business: a billing integration, a plan/entitlement model,
in-app gating of the free-tier limits, a trial, and dunning — with the least
possible tax/compliance burden on a solo operator, and with existing users
grandfathered so the switch to paid doesn't feel like a rug-pull.

## 2. Current state in code

- No billing, no plans, no `Stripe`/`Paddle` anywhere. `package.json` deps are
  just `better-sqlite3`, `express`, `multer`, `web-push`.
- `users` table (`server/db.js:88-93`): `id`, `email`, `created_at`,
  `widget_token`. No plan/subscription fields.
- Auth is the forgeable `nico_uid` cookie (see `docs/plan/01-identity-access.md`)
  — **billing cannot ship until Domain 1 milestone 1–2 do**, because entitlements
  must key off a real, verified account.
- Every route scopes by `req.userId`; there is one place to add an entitlement
  gate (a middleware) and one place the client learns its plan
  (`GET /api/session`, `server/routes/session.js:18-30`).
- No webhook endpoints; `express.json()` is global (`server/index.js:23`) which
  will need a `express.raw()` carve-out for webhook signature verification.

## 3. Proposed design

### 3.1 Provider choice

**Recommendation: a Merchant-of-Record (Paddle Billing or Lemon Squeezy), not
raw Stripe.** As a solo operator, MoR means the provider is liable for
collecting and remitting VAT/sales tax/GST worldwide and handles EU invoicing —
this removes an entire compliance workstream. Trade-off: ~5% + 50¢ vs. Stripe's
~2.9% + 30¢, and a smaller API surface. Pick **Paddle** if EU customers are
expected (best VAT handling, sandbox is solid); **Lemon Squeezy** if you want
the simplest possible setup and Stripe-owned roadmap. Use **Stripe directly only
if** you're prepared to bolt on Stripe Tax + invoicing and accept the filing
obligations.

The rest of this plan is written provider-agnostic: the app stores a mirror of
subscription state and trusts webhooks + a verification API call.

### 3.2 Schema (idempotent migration in `server/db.js`)

```
plans(
  code        TEXT PRIMARY KEY,       -- 'free' | 'pro' | 'lifetime' | 'team'
  name        TEXT NOT NULL,
  limits_json TEXT NOT NULL           -- JSON, see 3.4
)

subscriptions(
  id                 TEXT PRIMARY KEY,   -- provider subscription id (or 'free:'+user_id)
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code          TEXT NOT NULL REFERENCES plans(code),
  status             TEXT NOT NULL,      -- 'trialing'|'active'|'past_due'|'canceled'|'paused'
  provider           TEXT NOT NULL,      -- 'paddle'|'lemonsqueezy'|'stripe'|'manual'
  current_period_end TEXT,
  trial_end          TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  grandfathered      INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL,
  raw_json           TEXT                -- last webhook/customer payload
)
CREATE INDEX idx_subs_user ON subscriptions(user_id);

billing_events(                          -- webhook audit log / idempotency
  id          TEXT PRIMARY KEY,          -- provider event id
  type        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload     TEXT NOT NULL
)
```

- Seed `plans` in a migration (like the seed-user pattern at
  `server/db.js:158`). `free` is implicit: a user with no `subscriptions` row is
  treated as `free`.

### 3.3 Endpoints (new `server/routes/billing.js`)

- `GET /api/billing/state` → `{ planCode, status, trialEnd, periodEnd,
  cancelAtPeriodEnd, entitlements }`. Also fold `entitlements` into
  `GET /api/session` so the client has it on boot.
- `POST /api/billing/checkout` → creates a provider checkout/session for a given
  price, returns the hosted URL (Paddle overlay token / Lemon Squeezy URL).
- `POST /api/billing/portal` → returns the provider's customer-portal URL for
  card update / cancel.
- `POST /api/billing/webhook` — **mounted with `express.raw({type:'*/*'})`
  before the global `express.json()`, above the cookie gate** (it's
  signature-authed, like `/api/widget`). Verify the signature, dedupe on
  `billing_events.id`, upsert `subscriptions`, map provider status → local
  status. Handle: subscription created/updated/canceled/paused/resumed, payment
  succeeded/failed, and (Lemon Squeezy) license/order for lifetime.
- `POST /api/billing/reconcile` (cron, 6h) → pull each non-free subscription
  from the provider API and correct drift from missed webhooks.

### 3.4 Entitlements & gating

- `limits_json` per plan, e.g.:

```
free:     { notes: 200, reminders_per_note: 1, digests: false, backups: false,
            import: false, attachments_mb: 50, widget: true }
pro:      { notes: null, reminders_per_note: null, digests: true, backups: true,
            import: true, attachments_mb: 500, widget: true }
lifetime: same as pro
```

- One module `server/entitlements.js`: `entitlementsFor(userId)` →
  resolves the user's plan (subscription row or `free`), merges `limits_json`,
  applies `grandfathered` overrides. Cache per-request.
- Enforcement points (server-side, authoritative):
  - `POST /api/notes` → 402 with `{ error:'plan_limit', limit:'notes' }` when
    the owned active-note count ≥ `notes`.
  - `POST /api/import` (Domain 3) → gated on `import`.
  - digest opt-in (Domain 5) → gated on `digests`.
  - reminder create (Domain 5) → gated on `reminders_per_note`.
  - attachment size → `attachments_mb`.
  - backup/export: `GET /api/account/export` stays free (portability is a trust
    promise, per strategy.md); *automated* backups are the Pro perk framed as
    "we keep versioned off-site backups for you".
- Client: `entitlements` from `/api/session` drives soft gates — show an
  "Upgrade" sheet instead of the action when over a limit; never rely on the
  client for enforcement.

### 3.5 Trial, dunning, grandfathering

- **Trial**: 14 days, no card if the provider supports it (Paddle/LS do), status
  `trialing` with full Pro entitlements; on `trial_end` with no conversion →
  drop to `free` (soft — notes over the cap become read-only, nothing deleted).
- **Dunning**: on `past_due`, keep Pro entitlements for a 7-day grace, show a
  persistent in-app banner + email (Domain 1 mailer) with the portal link; after
  grace → `free`.
- **Grandfathering**: a migration stamps every `users` row that exists before
  launch with a `subscriptions` row `plan_code='pro'`, `provider='manual'`,
  `grandfathered=1`, no expiry. Founder can also grant comp accounts this way.
- **Lifetime deal** for first ~100 buyers: a `lifetime` plan fulfilled by a
  Lemon Squeezy one-time product or Paddle one-time price; webhook sets
  `plan_code='lifetime'`, `status='active'`, no `current_period_end`.

### 3.6 Pricing page

- Static `public/pricing.html` (or a section on the Domain 7 landing page),
  served as a normal static file. Three columns (Free / Pro monthly+annual /
  Lifetime), FAQ (billing, cancellation, data export, refunds). "Upgrade"
  buttons call `POST /api/billing/checkout`. Keep copy aligned with
  `strategy.md §5`.

### 3.7 Frontend

- Account overlay (`public/app.js`, end of file): add a "Plan" section — current
  plan, trial/period end, "Upgrade" (→ checkout URL) / "Manage billing" (→
  portal URL). Reuse `.overlay`/`.picker` styles and the `toast`/`confirmDialog`
  helpers just added.
- A reusable "Upgrade" sheet component triggered by any 402 `plan_limit`
  response.

## 4. Milestones

1. **[M] Schema + `plans` seed + grandfather migration** for existing users.
   Ship this early (before any paywall) so nobody is ever cut off.
2. **[M] `server/entitlements.js` + `GET /api/billing/state` + fold into
   `/api/session`**; wire soft client gates. No provider yet — everyone is
   `pro`/grandfathered, so it's inert but tested.
3. **[M] Provider integration**: checkout + portal + webhook (`express.raw`
   carve-out, signature verify, `billing_events` idempotency), sandbox
   end-to-end.
4. **[S] Enforcement**: turn on the free-tier limits in `POST /api/notes`,
   import, reminders, attachments; the Upgrade sheet.
5. **[S] Trial + dunning** state machine + banners + emails.
6. **[S] Pricing page** + account-overlay Plan section.
7. **[S] Lifetime deal** product + webhook mapping.
8. **[S] `reconcile` cron.**

## 5. Dependencies

- **Hard dependency on Domain 1** (real accounts) — cannot gate plans on a
  forgeable cookie. Milestones 1–2 can be built against the current cookie in
  dev but must not go paid until Domain 1 ships.
- **Domain 2** must ship its trust-gate milestones before a paywall is
  ethical/defensible ("pay us to keep your data safe" requires the backups to
  actually exist).
- **Domain 3 / Domain 5** provide the features being gated — coordinate the
  entitlement keys.
- **Domain 7** owns the pricing copy, the landing-page checkout entry points,
  and analytics on the funnel.
- External: Paddle or Lemon Squeezy account + products/prices; a cron runner for
  reconcile; the Domain 1 mailer for dunning.

## 6. Risks & mitigations

- **Webhook body-parsing conflict** — `express.json()` is global at
  `server/index.js:23`; the webhook route must be registered with
  `express.raw()` *before* that line, or move `express.json()` to be per-router.
  Note this explicitly in the implementation.
- **Missed webhooks → wrong entitlements** — `reconcile` cron + `billing_events`
  idempotency log + a manual "refresh from provider" button in the account
  overlay.
- **Charging before trust exists** — sequence behind Domain 2 milestones 1–4;
  keep data export free forever.
- **Grandfather migration missing a user** — run it, then assert
  `COUNT(users) == COUNT(grandfathered subscriptions)`; keep it idempotent.
- **MoR fee drag** — acceptable for the compliance offload at this scale;
  revisit at higher MRR.
- **Downgrade data loss anxiety** — over-limit notes go read-only, never
  deleted; message it clearly; export always available.
- **Chargebacks / fraud** — MoR handles most; disable Pro entitlements on
  `chargeback`/`refund` webhook.

## 7. Open questions for the founder

1. Paddle vs. Lemon Squeezy vs. raw Stripe — appetite for handling own tax
   compliance? (Strong recommend MoR.)
2. Price points: confirm strategy.md's $4–8/mo, annual discount %, and the
   lifetime price + cap.
3. Free-tier limit: note count (what number?), or feature-gated (no push/backup/
   import) with unlimited notes? (Affects perceived value + conversion.)
4. Trial length and card-required-or-not?
5. Team plan now or later? (Deferring keeps this domain much smaller.)
6. How generous is grandfathering — full Pro forever, or Pro for 12 months then
   a loyalty discount?
