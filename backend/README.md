# Fuelo backend

Fuelo uses Express and MongoDB. Use Node 22 and start a local MongoDB instance before running the API.

```sh
npm ci
cp .env.example .env
npm run dev
npm test
```

The default API base URL is `http://localhost:8000/api`. Health checks are available at `/health` and `/api/health`. Set the frontend's `VITE_API_BASE_URL` to the API base URL. Authenticated routes use the session's bearer token. Public receipts use `GET /api/public/receipts/:token`, and the legacy `/links` routes remain available. Razorpay can still send callbacks to `/billing/webhook`.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Runtime environment and HTTP port. Defaults are development and 8000. |
| `MONGO_URI` | Required MongoDB connection string. |
| `JWT_SECRET` | Required signing secret. Production requires at least 32 characters. |
| `BCRYPT_SALT_ROUNDS` | Password hash cost. Access tokens last 15 minutes. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxy hops. Defaults to `0` for direct access. |
| `CORS_ORIGINS` | Comma-separated frontend origins. Development defaults to `http://localhost:5173`. |
| `PUBLIC_APP_URL` | Browser-facing origin used in member invitation URLs. |
| `TWILIO_WHATSAPP_OTP_CONTENT_SID`, `TWILIO_WHATSAPP_INVITE_CONTENT_SID` | Approved WhatsApp template SIDs for password recovery and invites. |
| `RAZORPAY_PLAN_<NAME>_<CYCLE>` | Razorpay plan IDs for Starter, Growth, and Business, with monthly and yearly cycles. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` | Credentials and sender addresses for queued messages. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Billing credentials and callback signing secret. |
| `LINK_TOKEN_SECRET`, `LINK_TOKEN_TTL_HOURS` | Reserved signing setting and receipt lifetime. Current receipt tokens are random and stored in MongoDB. The default lifetime is 48 hours. |

Set `TRUST_PROXY_HOPS=1` on a deployment with exactly one trusted reverse proxy in front of Express. The proxy must overwrite or append the real peer address in `X-Forwarded-For`, and clients must reach Express through that proxy. Match the value to the actual network path before enabling it.

Per IP, login allows 30 unsuccessful requests per 15 minutes. Successful logins release their slot once the response finishes. Signup has its own budget of 10 requests per 15 minutes. Counters are stored per process.

## Phase 2 deployment

Back up MongoDB and run the migration before sending traffic to the new backend. Run these commands from `backend/` against the intended database.

```sh
node scripts/migrateToMemberships.js --dry-run
node scripts/migrateToMemberships.js
node scripts/seedPlans.js
```

The migration preserves legacy Dealer documents, workspace IDs, configuration, and data. It creates owner memberships and gives migrated workspaces a new 14-day trial. An existing account password takes precedence, and the newest legacy password is used when a phone has several legacy workspaces and no account. Previous access tokens require a fresh sign-in.

Seed Razorpay plans with test-mode keys and matching test-mode plan IDs first. The seeder prints a warning for each missing ID. Configure the signed callback at `/api/billing/webhook` for subscription activation, charges, pending, halted, cancelled, completed, and update events. Checkout completion leaves the plan pending until a verified event arrives. Cycle-end plan changes use the existing Razorpay subscription. Some payment methods, including UPI, can require cancellation and a new checkout after the current cycle.

Set approved WhatsApp Content SIDs for business-initiated invites and recovery. OTP content uses variable `1` for the six-digit code. Invite content uses `1` for the business name and `2` for the code appended to `PUBLIC_APP_URL/invite/`. Plain text is available for development or an open WhatsApp session. Session codes and invite links are redacted from message history.

## Sessions and roles

The API caches account, role, and workspace checks for up to 30 seconds per instance. Member and password changes invalidate the cache immediately on the instance that handles them. The browser performs a fresh session check every 25 seconds while open. Access tokens expire after 15 minutes, refresh tokens are opaque and hashed in MongoDB, and refresh replay revokes the affected family. The browser stores both tokens separately in localStorage, where script injection can access them. Deploy the frontend with appropriate script restrictions and protect against XSS.

| Capability | Owner | Manager | Attendant |
| --- | --- | --- | --- |
| Sales entry, customer lookup, and account settings | Yes | Yes | Yes |
| Transaction history and dashboard | Workspace | Workspace | Own sales today (IST) |
| Voids, credit and payments, inventory, reports | Yes | Yes | Restricted |
| View members | Yes | Yes | Restricted |
| Manage members, billing, workspace settings, and audit log | Yes | Restricted | Restricted |

| Tier | Monthly / yearly INR | Transactions per IST month | Seats per workspace | Owned workspaces |
| --- | --- | --- | --- | --- |
| Trial (14 days) | Free | 100 | 3 | 2 |
| Starter | 499 / 4,990 | 300 | 1 | 1 |
| Growth | 999 / 9,990 | 1,500 | 5 | 2 |
| Business | 1,999 / 19,990 | Unlimited | 15 | 5 |

Trial, Growth, and Business include credit tools and reports. Trial and Business include CSV export. Expired workspaces can still view and export existing data. Failed payments have a three-day grace period.

## Stock, customer balances, and reports

Tracked sales, voids, and payments use MongoDB transactions on a replica set or sharded cluster. Standalone MongoDB uses per-process ordered writes and compensation. Use a replica set for production because a standalone process crash can interrupt compensation.

Phase 1 tracks stock and credit effects as they are posted. Earlier sales have no reliable stock movement or credit entry to reverse, so voiding them updates their status without guessing an inventory or balance adjustment. A void after a payment can leave a credit on the customer account. Tracked inventory with active sales cannot be removed because those sales may need stock restored.

Use `GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day` with a bearer token. The date range is inclusive in Asia/Kolkata and is limited to 366 days. Grouping also supports `item` and `paymentMode`. Add `format=csv` to download grouped rows and a total row.

The test suite starts its own in-memory MongoDB and HTTP server. Its first run may download a MongoDB binary. It uses a replica set by default. Set `FUELO_TEST_STANDALONE=1` to exercise compensation against standalone MongoDB. It leaves the scheduler off and uses no live provider credentials.
