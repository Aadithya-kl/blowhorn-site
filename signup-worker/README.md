# Blowhorn signup worker

The API behind the coming-soon waitlist forms, the newsletter signup and the
support page's contact form:
`POST /api/waitlist`, `POST /api/subscribe`, `POST /api/support`, `GET /api/unsubscribe` (confirmation page), `POST /api/unsubscribe`.
No confirmation step: a signup is live as soon as it is stored. Every
ship email and newsletter email carries an unsubscribe link built from
the row token.

## Support messages

`POST /api/support` accepts a required `message` (5,000 characters), and:

- `reason`: `feedback` (default), `issue`, `product`, `pricing`, `connect`.
- `contact_preference`: `anonymous` (default without email), `reply`.
  A response requires a valid email; name is optional. Anonymous discards name
  and email on the server even if a client submits them. For old clients that
  omit the preference, an email implies `reply`.
- Server-generated `subject` (reason plus a unique UUID case number); any submitted subject is ignored. Optional `details`
  (5,000 characters), `diagnostics_reference` (single line, 500 characters).
  References are unverified text, never fetched. Files are not accepted.

The D1 table `support_messages` is the local record (migrations 0003, 0004
and 0005). Apply migrations 0004 and 0005 before deploying the Worker. 0004
adds reason, response preference, diagnostic reference and a unique case
number; old rows default to feedback/reply. 0005 adds the per-case creation
proof. Empty identity stays empty, never a placeholder email.

Every submission becomes a durable Cloud support case: the Worker POSTs to
`SUPPORT_CASES_URL` (the cases route) with the website client key in
`SUPPORT_CASES_CLIENT_KEY` (a wrangler secret, set with
`wrangler secret put SUPPORT_CASES_CLIENT_KEY`). The case number is the
`caseId`; the creation proof authenticates an idempotent replay, so a
retried forward never duplicates the case or its private GitHub issue. A
201 (created) or 200 (identical replay) marks the row forwarded; a 409
payload conflict or any other failure leaves `forwarded_at` NULL for
investigation and replay. Anonymous submissions send no email or name.
Reason, preference and reference ride in the case payload. The case
contract: `docs/reference/support-cases.md` in meshery-cloud.

**Release dependency:** deploy only after the Cloud support-cases route
(https://github.com/layer5io/meshery-cloud/pull/6542, tracking
https://github.com/layer5io/meshery-cloud/issues/6533) is live and a
`website` client key is provisioned there. The form records whether a
response is requested, not a notification subscription. The team still
needs an owned response workflow and a verified notification path before
promising automated fix emails.

Forwarding is best-effort: a failure leaves `forwarded_at` NULL in D1 for
replay. This change does not add a replay worker. Test forwarding and inspect
the destination before claiming end-to-end delivery. A missing URL or client
key stores only. Honeypot, per-IP rate limit and CORS are unchanged. Form
posts redirect to `/support/thanks/`. Anonymous does not mean network
anonymity: the Worker receives an IP for rate limiting, and free text can
identify people. Diagnostics packages never travel through this form; the
reviewed CLI flow (`blowhorn diagnostics bundle`, then `case-prepare` and
`case-send`) creates its own case with the package attached.

## Hosting

- Worker: `blowhorn-signups`, served at `https://api.blowhorn.ai`
  (custom domain). A `blowhorn.ai/api/*` route was dropped: the apex is
  DNS-only, so such a route can never serve traffic, and creating it
  failed the deploy (the Cloudflare API refused the routes update).
  If the apex is ever proxied, the route can be re-added then.
- Store: Cloudflare D1 database `blowhorn-signups`, bound as
  `SIGNUPS_DB`. The same database is bound to the internal worker,
  which serves the Access-gated admin page and CSV export at
  `https://internal.blowhorn.ai/internal/signups/`. Support messages
  live in the same database (`support_messages`).
- CORS: only `https://blowhorn.ai` may call the API from a browser.

## Deploy

`.github/workflows/signup-worker.yml` deploys on pushes to master
that touch `signup-worker/`, and on manual dispatch. It runs the
node tests, then `.github/scripts/resolve-d1.sh` (creates the D1
database if it is missing and writes its id into `wrangler.json`),
applies `migrations/`, and deploys with wrangler. The
`database_id` committed here is a placeholder on purpose: never
deploy this worker by hand without running `resolve-d1.sh` first,
or wrangler will fail on the placeholder.

## Tests

`node --test signup-worker/worker.test.mjs` (also run by the
deploy workflow). The tests inject an in-memory fake for the six
db methods, so no D1 instance is needed.
