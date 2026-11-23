# Fuelo: Application Flow (end to end)

The entry point for understanding the app. It describes what happens, from a visitor opening the site to a nightly summary landing on WhatsApp. For testing, see [QA.md](QA.md). For backend setup, see [backend/README.md](backend/README.md).

The PostgreSQL migration branch uses PostgreSQL for password recovery challenges, their expiry cleanup, and the daily scheduler lock. The scheduler uses the unique job name and IST run date to let one instance acquire each daily run. The nightly summary, message worker, and remaining application data still use the MongoDB paths below. The target schema and cutover status are tracked in [POSTGRES_PLAN.md](docs/POSTGRES_PLAN.md).

> Status: this describes Phases 0 through 3b as built. Section 16 lists planned work. Phase 2 was verified with local backend tests and a Chrome smoke test. Phases 3a and 3b passed local backend tests in both MongoDB modes and Chrome workflow checks. Live Twilio delivery, live Razorpay Checkout and hosted CI for this working tree remain unverified. Use QA.md to track staging checks.

---

## 1. The big picture

Fuelo is a multi-tenant SaaS for Indian small businesses (petrol pumps, timber, later construction and real estate). Staff record sales, track credit (udhaar) and stock, and customers get receipts on WhatsApp.

```
 Browser (React + Vite)                      Backend (Express + Mongoose)              External
 ─────────────────────                      ─────────────────────────                ────────
 Login / Signup / Pricing      ── HTTPS ──►  /api/*  (auth, transactions,   ──────►  MongoDB Atlas
 App shell + pages                           customers, inventory, reports,           (replica set)
 Public receipt page                         members, billing, audit …)
                                                    │
                                                    ├── MessageJob queue ──► Twilio (WhatsApp / SMS)
                                                    ├── Cron scheduler (queue drain every 30s, EOD 23:55 IST)
                                                    └── Razorpay (subscriptions + webhook)
```

**Tenancy rule:** every business is a **Workspace**. Tenant data carries `workspaceId`. The `requireWorkspaceScope` plugin requires it on guarded find, count, update and delete operations. Aggregation pipelines apply the workspace filter explicitly. Cross-workspace system queries use an explicit `skipWorkspaceGuard` option.

---

## 2. Who the people are

| Concept | Meaning |
|---|---|
| **UserAccount** | A person: phone (unique), password hash, token version |
| **Workspace** | A business (pump, timber yard…): name, vertical type, config, plan/trial state |
| **Membership** | Links a user to a workspace with a role and status |
| **Roles** | `owner` > `manager` > `attendant` (single source: `backend/src/config/permissions.js`) |

One person can belong to several workspaces. Each login/session is **for one workspace at a time**.

---

## 3. Startup (backend)

1. `backend/src/index.js` loads config (`config/env.js`), connects MongoDB, builds the app from `src/app.js`, and starts the scheduler.
2. `src/app.js` wires middleware in order: helmet, CORS allowlist, request logging, rate limiters, JSON body parser (keeps the raw body for the Razorpay signature), then routers under `/api/*`, then the error handler.
3. Scheduler (`services/scheduler.service.js`):
   - **Every 30 seconds:** drain pending WhatsApp/SMS jobs.
   - **23:55 IST daily:** end-of-day summary (guarded by a daily lock so two instances can't double-send).

---

## 4. Visitor → account

```
Visit site
  ├─ /pricing  → see plans (₹ + limits)
  ├─ /signup   → businessName, phone, vertical, password
  │      POST /api/auth/signup
  │        creates UserAccount + Workspace + owner Membership
  │        sets 14-day trial, default item types by vertical
  │        returns { access token (15 min), refresh token, session }
  │      → lands on Dashboard with a "trial: X days left" banner
  └─ /login    → phone + password
         POST /api/auth/login (rate limited; only failed attempts count)
         → picks the most recently used active workspace
```

**Forgot password:** `POST /api/auth/otp/request` → 6-digit code queued as WhatsApp → `POST /api/auth/otp/verify` → set new password. Responses never reveal whether a phone exists. Codes are hashed, expire in 10 minutes, allow 5 attempts, and have a 60-second resend cooldown.

---

## 5. Session lifecycle

1. Authenticated API calls send `Authorization: Bearer <access token>` (axios interceptor in `frontend/src/api/client.js`).
2. `middleware/auth.middleware.js` verifies the token (HS256), then confirms the user is active, the token version matches, the membership is active and the workspace is active. Ordinary requests cache these lookups for **up to 30 seconds per backend instance**. Member and password changes invalidate the local cache. The browser checks `GET /api/auth/session` every 25 seconds and on window focus, using a fresh membership check.
3. `requirePermission("…")` then checks the role's permission list (default deny).
4. On a 401, the frontend makes one refresh call (`POST /api/auth/refresh`; concurrent 401s share one refresh) and retries once. Refresh tokens rotate; reusing an old one revokes the whole family.
5. Logout revokes the current refresh-token family. `POST /api/auth/logout-all` and password changes bump the account's token version and revoke refresh sessions. A successful password change returns a fresh session for the current device. Logout-all is API-only.
6. `GET /api/auth/session` returns the active workspace profile, role, permission list and billing preview, so the UI can show only what the role may do. **The backend remains the source of truth.**

---

## 6. Core flow: recording a sale

```
Staff opens "New transaction"  (/transactions/new)
  │  customer autocomplete (workspace-scoped, regex-escaped)
  │  item + quantity → amount auto-filled from list price × quantity (editable)
  │  payment mode: cash | upi | credit
  ▼
POST /api/transactions
  1. Authenticate and attach workspace
  2. Validate body (Zod) → permission "transactions:create" → entitlement check
        (writable workspace, available monthly capacity, credit feature when applicable)
  3. Stock: atomic conditional decrement
        (rejects 409 if insufficient stock, unless workspace allows negative stock)
        writes a StockMovement row
  4. If payment = credit:
        find-or-create Customer by phone
        check credit limit (409 unless override)
        write LedgerEntry (credit_sale) and increase customer balance atomically
  5. Store transaction (list-price snapshot, price-mismatch warning, createdBy)
  6. Enqueue WhatsApp receipt (MessageJob) ← not sent inline
  7. Audit a credit-limit override when used by an owner or manager
  ▼
Response 201 → UI shows the sale; optional "share receipt" / "download PDF"
```

Where supported, stock, credit, sale and queue writes run inside a MongoDB transaction; on standalone Mongo they run as ordered writes with compensation (use a replica set in production).

### Receipt sharing
- `POST /api/transactions/:id/share-link` creates a token link (valid 48 hours by default; can be opened many times, since link-preview bots must not burn it).
- Customer opens `/share/:token` (alias `/receipt/:token`) → `GET /api/public/receipts/:token` → shows business name and the sale.
- `GET /api/transactions/:id/receipt.pdf` streams a PDF for users who can read the sale when plan access allows it.

### Voiding
`POST /api/transactions/:id/void` (owner/manager, reason required): marks voided, restores stock, reverses the ledger effect. If the customer had part-paid, the collected amount stays as **Customer credit** (a negative balance). Voided sales stay visible in history and are excluded from sales totals. Legacy sales without recorded stock or ledger effects are voided by status only.

---

## 7. Credit (udhaar) flow

```
Credit sale  → LedgerEntry(credit_sale)  → customer balance ↑
Payment      → POST /api/customers/:id/payments {amount, paymentMode}
                 rejects amount > outstanding
                 LedgerEntry(payment)   → balance ↓
                 queues a WhatsApp "payment received" message
Void a sale  → LedgerEntry(void_reversal) → balance adjusted
```

The **Credit / Udhaar** page (`/credit`, `/credit/:id`) shows total outstanding, customers with dues, each customer's ledger, and a "Record payment" action. Owners and managers can view existing balances and ledgers. Recording a payment requires a writable workspace and the credit feature.

---

## 8. Inventory and prices

- **Inventory** (`/inventory`): per item type, current stock, unit, price per unit (owner/manager).
- Every stock change (sale, void, manual adjustment) writes a **StockMovement** with the resulting balance.
- Each unit-price change through the inventory update endpoint writes a **PriceHistory** row and a `price.update` audit entry.
- Stock can't oversell: ten parallel sales against five units give five successes and five conflicts (covered by a test).

---

## 9. Messaging pipeline

```
Any action → MessageJob(status: pending) ──► every 30s: drain
                                              ├─ send via Twilio (WhatsApp/SMS)
                                              ├─ success → sent
                                              └─ failure → retry, up to maxAttempts, then failed
                                              + a Notification row (audit trail)
```

- The **Messages** page lists notifications and lets owners/managers retry eligible failed deliveries on writable workspaces (`POST /api/notifications/:id/retry`). Request a new OTP or invite when a private delivery fails.
- `config/verticals.js` defines item defaults, units, labels, flags and English and Hinglish wording. `GET /api/auth/session` returns the workspace language and vertical flags. `services/messageBuilder.service.js` uses those definitions for receipts, payments, nightly summaries, OTPs and invites. Password-reset and invitation jobs support approved Twilio Content SIDs and are redacted in notification history. Live delivery with approved templates remains unverified.
- The queue handles sale and payment receipts, OTPs, invites, nightly summaries, shift variance alerts and fleet dues reminders. The two pump notifications use configured approved Twilio Content SIDs when present, with a language-specific Hinglish SID preferred for Hinglish workspaces. Without a SID they use localized message bodies, which Twilio accepts only within its WhatsApp conversation window.

---

## 10. Teams and permissions

| Capability | Attendant | Manager | Owner |
|---|:-:|:-:|:-:|
| Record sales and look up customers | Yes | Yes | Yes |
| Transaction history and dashboard | Own sales today (IST) | Workspace | Workspace |
| Void sales, record credit payments, manage customers | ❌ | ✅ | ✅ |
| Inventory & prices, reports, notifications | ❌ | ✅ | ✅ |
| Register tanks and nozzles, receive or void deliveries | No | Yes | Yes |
| Open and close shifts | Own open shift | Workspace | Workspace |
| View shift history and reopen latest eligible shift | No | Yes | Yes |
| Record and review dips | Own dips today when enabled | Yes | Yes |
| Run the daily pump report and queue fleet dues reminders | No | Yes | Yes |
| Enter a dimension-based timber sale | Yes | Yes | Yes |
| Configure timber inventory, record purchases, and manage suppliers and payables | No | Yes | Yes |
| View timber invoices and issue credit notes | No | Yes | Yes |
| Configure tax profile and per-item HSN and GST rates | No | No | Yes |
| View members | ❌ | ✅ | ✅ |
| Manage members, billing, settings, audit log, delete workspace | ❌ | ❌ | ✅ |

**Invite flow:** Owner → `POST /api/members/invite` → WhatsApp with a one-time link (valid 7 days) → `/invite/:token` → `POST /api/auth/accept-invite` → membership becomes active. New users set a password, while existing users retain their password. The last active owner can't be removed or demoted; nobody can change their own role.

**Audit log:** voids, payments, credit-limit overrides, price and stock changes, member and role changes, settings, password changes and logins are recorded. Owners read and filter them on `/activity` via `GET /api/audit`. A failed audit write is logged but never blocks the action.

---

## 11. Plans, trial and billing

```
Signup → trialing (14 days)
   │
   ├─ choose plan on /pricing → POST /api/billing/subscriptions → Razorpay Checkout
   │        Razorpay webhook → POST /api/billing/webhook
   │          verify HMAC signature → dedupe by event ID → ignore older/out-of-order events
   │          update plan/status/period → (if referred) dedupe revenue share by payment ID
   ▼
active ──(payment fails)──► past_due (3-day grace) ──► read-only
   │
   └─ cancel at cycle end ──► cancelled/expired ──► read-only
```

**Entitlements** (`services/entitlements.service.js`) enforce write access and applicable feature limits:
- seats per plan, workspaces per owner, monthly transaction cap (IST calendar month, non-voided only),
- The sale that reaches 80% usage succeeds with a warning. Once usage reaches the cap, the next sale receives `402 PLAN_LIMIT_TRANSACTIONS`.
- trial expired or inactive subscription → **read-only**: viewing and CSV export still work, nothing is hidden or deleted.

| Tier | Monthly sales cap | Seats | Owned workspaces | Active plan features |
|---|---:|---:|---:|---|
| Trial | 100 | 3 | 2 | Credit writes, reports, CSV, PDF, pump pack and timber pack |
| Starter | 300 | 1 | 1 | Core sales and receipts |
| Growth | 1,500 | 5 | 2 | Credit writes, reports, CSV, PDF, pump pack and timber pack |
| Business | Unlimited | 15 | 5 | Credit writes, reports, CSV, PDF, pump pack and timber pack |

The frontend opens an upgrade modal for a `402` with `upgradeRequired: true`. Owners use `/settings/billing` for usage and renewal status (`GET /api/billing/status`) and cycle-end cancellation (`POST /api/billing/cancel`). Checkout relies on a signed webhook to activate the plan. Razorpay calls and revenue sharing were tested with fixtures and mocks. Live checkout and transfers remain unverified.

---

## 12. Reports and nightly summary

- **Reports** (`/reports`, owner/manager): `GET /api/reports/sales` grouped by day, item or payment mode, using IST dates, excluding voids, with a 366-day cap. Use `format=csv` when export access is available.
- **Dashboard** (`/`, `GET /api/dashboard/daily-summary`): today's totals per item. Attendants see their own sales for the current IST date.
- `GET /api/summary?date=YYYY-MM-DD` returns IST-date summary totals for owners and managers.
- **End of day, 23:55 IST:** for each active workspace, aggregate the day, store a `DailySummary` snapshot and queue a WhatsApp summary to the owner.

---

## 13. Frontend map

| Route | Page | Access |
|---|---|---|
| `/login`, `/signup`, `/pricing`, `/invite/:token` | Auth, plans, accept invite | Public |
| `/receipt/:token` (and `/share/:token`) | Shared receipt | Public |
| `/` | Dashboard | All roles |
| `/transactions`, `/transactions/new`, `/transactions/:id` | History, new sale, detail (PDF, share, void) | All roles (scoped) |
| `/credit`, `/credit/:id` | Dues, ledger, payments | Owner, manager |
| `/inventory` | Stock and prices | Owner, manager |
| `/reports` | Sales reports + CSV | Owner, manager |
| `/messages` | Notification log + retry | Owner, manager |
| `/members` | Team, invites | Owner (manager can view) |
| `/activity` | Audit log | Owner |
| `/workspaces` | Switch workspaces for active memberships. Owners can create or deactivate owned workspaces within the applicable limits. | All roles for switching, owner for changes |
| `/settings` | Password change, message language, pump settings, or timber tax settings and advance access where applicable | All roles for password change, owner for workspace settings |
| `/pump/shifts` | Open and close shifts, preview variance, and view shift history | Owners and managers, attendants for their own open shift |
| `/pump/tanks` | Tank gauges, nozzle setup, deliveries and dips | Owners and managers, attendants for dips when enabled |
| `/pump/report` | IST daily pump reconciliation and eligible CSV export | Owner, manager |
| `/timber/purchases`, `/timber/suppliers` | Receive woods by dimension, browse bills, settle supplier balances | Owner, manager |
| `/timber/invoices`, `/timber/invoices/:id` | Invoice list, PDF, and credit note | Owner, manager |
| `/timber/reports` | Timber stock, sales by species, FIFO aging, profit estimate, GST summary and eligible CSV | Owner, manager |
| `/settings/billing` | Plan, usage, and cancellation | Owner |

`AppShell` protects workspace pages and hides navigation unavailable to the current role. Public account, pricing, invite and receipt pages are separate.

---

## 14. Phase 3a: Petrol pump pack

### Backend test suites

Tests under `backend/tests/` are split by auth, stock, credit, reports, billing, members, pump operations and pure logic. They share an isolated HTTP and MongoDB fixture. `npm test` uses a replica set by default, and `FUELO_TEST_STANDALONE=1` exercises ordered compensation. `npm run test:coverage` adds Node's coverage report.

### Pump pack foundation

The pump gate requires a fuel vertical flag and the `pumpPack` plan feature. Trial, Growth and Business include it. Starter returns `402 FEATURE_NOT_IN_PLAN`. The session exposes the flags for the phase's frontend routes.

### Tanks and tanker deliveries

Owners and managers use `/api/tanks` to register physical tanks and `/api/deliveries` to record, filter or void receipts. A fuel item measured in litres keeps one inventory total equal to the sum of tank book stock. The first tank takes the existing two-decimal balance if it fits. Sales, voids, deliveries and manual stock updates use the stock service and write movement details. Overfilling takes an explicit audited override. Deactivation takes a reason and retains the tank record.

### Nozzles and shifts

`/api/nozzles` exposes active nozzle readings. Managers and owners configure nozzles. Only one `/api/shifts/open` operation can succeed per workspace at a time. The opening meter defaults to the last reading, and a difference requires an audited explanation. Item prices are snapshotted at open.

Sales recorded during the open shift carry `shiftId`. At close, net meter litres are closing minus opening minus test litres. The stock service posts the difference between physical meter movements and stock already removed by individual sales, including reallocation to the correct tank when needed. Declared cash, UPI and card plus active credit sales minus expected meter sales determine variance. The close is idempotent and can queue an owner WhatsApp alert. Owners and managers can reopen the latest closed shift within 24 hours, reversing the meter adjustment and restoring the previous meter readings. A sale linked to a closed shift can be voided after reopening.

### Dip readings and daily pump reconciliation

`GET` and `POST /api/tanks/:id/dips` list or record physical readings. Managers and owners can record dips. When enabled, attendants can record and review their own dips for the current IST day. The variance compares each physical reading with book stock at the time it was recorded.

`GET /api/reports/pump-daily?date=YYYY-MM-DD` reconciles tank and item opening, deliveries, individual sales, net meter adjustments and closing stock. It also lists closed shift summaries. Voided records are excluded from the sales and deliveries columns. Their dated stock postings appear under adjustments so book balances still reconcile. Same-day void postings net to zero. Meter totals describe physical volume, while meter adjustments explain only the stock effect at close. CSV uses the existing export entitlement, included in Trial, Growth and Business. The alert threshold defaults to 0.5% of posted throughput. This report is a decision aid.

### Fleet credit

Fuel sales may include a normalized vehicle number. Credit sales save the number to the customer's fleet. The outstanding report applies ledger payments FIFO, removes voided charges, and reports the oldest unpaid sale's age in IST days. `minDaysOverdue` applies the customer's optional credit terms. Owners and managers with the pump pack can queue `POST /api/customers/:id/reminder` once per 24 hours per customer. Reminders use the workspace's message language and are audited. Live delivery remains unverified.

## 15. Phase 3b: Timber pack

### Timber items and dimensions

`GET /api/timber/items` lists timber items for sale entry. Managers and owners configure species, grade and pricing unit with `PUT /api/timber/items`. The stock adjustment route records a reason and updates quantity and pieces together. Timber transactions price each line using server-computed dimensions, then add charges. The stock service decrements and reverses both balances on sale and void.

### Purchases, suppliers and payables

Owners and managers add, edit and deactivate suppliers under `/api/suppliers`. Opening balances are ledger adjustments. The ledger records purchases, payments and void reversals. A payment beyond the balance needs the explicit advance flag. A purchase under `/api/purchases` adds quantities and pieces and posts its payable. Voiding restores the stock position and reverses the amount billed. Recorded payments remain in the supplier ledger and can leave an advance.

### Part payments and advances

A timber part payment is recorded against the sale for reference. Only the unpaid amount enters the balance as a credit sale. The `allowAdvances` setting allows customer payments beyond dues. New credit sales automatically consume available customer credit and record the applied amount in the ledger. On void, the unpaid charge reverses and collected cash is retained as customer credit.

### Tax profiles, invoices and credit notes

Owners configure `/api/timber/tax-profile` and each item's HSN and GST rate. GSTINs are format- and checksum-validated. The registered profile and configured rates are copied to immutable invoice data along with buyer and place of supply. Same-state supply splits tax between CGST and SGST, with one paise assigned to CGST when an odd amount cannot be divided exactly. Other-state supply uses IGST. The invoice shows round-off to the nearest rupee. Each financial year starts on April 1 IST, and invoices and credit notes use separate sequences.

The invoice list and PDF are under `/api/invoices`. The existing sale void action handles bills of supply. Tax invoices require `POST /api/invoices/:id/credit-note`, which reverses stock and ledger effects and keeps the original number in history. The GST summary under `/api/reports/gst-summary` shows issued invoice and credit-note tax effects for the selected dates, including a negative entry for a credit note in its own period. It is a working summary for the accountant. Tax settings and document formats require the business's CA review.

### Timber reports and messages

`/api/reports/timber/:kind` returns current stock, sales by species and pricing unit, FIFO customer and supplier aging (using the supplier invoice date for purchase balances), or estimated margin using the weighted-average purchase cost through the end of the selected period. CSV uses the export entitlement. Profit estimates leave cost and margin blank where no purchase cost is recorded. Timber adds deterministic English and Hinglish dimensions receipts and purchase acknowledgements to the WhatsApp queue and uses the existing payment and dues messages. Live delivery remains unverified.

Timber navigation uses the workspace flags and role permissions. Timber inventory and the sale form use the existing Inventory and New transaction routes. Tax preview uses `POST /api/timber/sale-quote` and the same calculation as invoice creation. The Trial, Growth and Business snapshots include timber access. Starter feature requests return the existing 402 upgrade response.

## 16. Planned (not built yet)

| Phase | What | Notes |
|---|---|---|
| **1.5** | Daily fuel-price feed: provider layer, `FuelPrice` store, suggest-and-confirm per workspace | Needs a vendor decision; there is no official API |
| Later | Super-admin panel, onboarding wizard, usage metering, monitoring (Sentry), backups, migrations tooling, construction and real-estate modules | |

---

## 17. Deployment checklist (summary)

1. MongoDB Atlas (replica set), database user, IP access list.
2. Configure `MONGO_URI`, `JWT_SECRET` (32+ characters), `CORS_ORIGINS`, `PUBLIC_APP_URL`, Twilio, Razorpay and `RAZORPAY_PLAN_*`. Set `TRUST_PROXY_HOPS` to match the actual proxy path.
3. From `backend/`, run `node scripts/migrateToMemberships.js --dry-run`. Review the counts before applying the migration with `node scripts/migrateToMemberships.js`.
4. Seed test-mode plans with `node scripts/seedPlans.js`, including the updated Growth and Business pump and timber pack snapshots. Configure the optional Hinglish Twilio Content SIDs listed in [QA.md](QA.md) for staging delivery checks.
5. Configure `VITE_API_BASE_URL=https://<backend>/api` for the frontend and send signed Razorpay subscription events to `https://<backend>/api/billing/webhook`.
6. Run through [QA.md](QA.md).
