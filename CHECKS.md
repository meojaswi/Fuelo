# CHECKS.md: things to review or change before deployment

A running list of shortcuts, placeholders and open decisions. Go through it before the first real deployment, and remove an item once it's resolved.

Legend: `[ ]` open · `[x]` resolved (add the date and a note)

---

## Test and CI placeholders

- [ ] **`backend/tests/core.test.js` sets placeholder env vars** (`MONGO_URI`, `JWT_SECRET`, `NODE_ENV=test`) at the top of the file so the unit tests can import app modules in CI, where there is no `backend/.env`.
  - These values are test-only and never connect to a database. They must **never** be used as real configuration.
  - Better long-term: move them into a shared `tests/helpers/env.js` required first by every test file, so a new unit test can't hit the same "Missing required env var" crash. (Added 2026-11-23 after CI run 45218122003 failed.)
- [ ] Confirm the latest CI run is green on the commit you actually deploy.

## Environment variables to set on the host (production values)

- [ ] `MONGO_URI`: MongoDB Atlas (replica set; do not use a single-node database)
- [ ] `JWT_SECRET`: 32+ random characters, different from any test or dev value
- [ ] `CORS_ORIGINS`: your real frontend URL(s) only
- [ ] `TRUST_PROXY_HOPS=1` (the default is 0; without it, rate limiting treats every user behind the host's proxy as one IP)
- [ ] `NODE_ENV=production`
- [ ] Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM`
- [ ] Razorpay (live keys only after KYC): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- [ ] Razorpay plan IDs: `RAZORPAY_PLAN_<STARTER|GROWTH|BUSINESS>_<MONTHLY|YEARLY>`
- [ ] Frontend `VITE_API_BASE_URL=https://<backend>/api`
- [ ] No `.env` file is committed or baked into a Docker image (check `.dockerignore` exists)

## WhatsApp and messaging

- [ ] Production WhatsApp sender approved by Meta (the sandbox is for testing only)
- [ ] Message templates approved for every business-initiated message: customer receipts, payment receipts, OTP, invites, shift alerts, dues reminders, nightly summary
- [ ] Twilio Content SIDs set for the templates the code expects (see `backend/.env.example`)
- [ ] Per-message cost known, and plan caps checked against it (see Pricing)

## Billing and pricing

- [ ] Razorpay live mode enabled (business KYC complete)
- [ ] Webhook URL set to `https://<backend>/api/billing/webhook` and tested with a test-mode event
- [ ] `node scripts/seedPlans.js` run once against the production database
- [ ] Pricing page lists only features that exist. Check "SMS fallback on failure", "Multiple item verticals", "Custom message templates", "Priority support"
- [x] CSV export moved to **Growth** (2026-11-23): `csvExport: true` in `backend/src/config/plans.js`, and the pricing page now lists it under Growth. **Re-run `node scripts/seedPlans.js`** so stored plan snapshots pick it up, and check that a Starter workspace still gets the upgrade dialog on CSV.
- [ ] Re-check the plan comparison on the pricing page: Business now has no CSV bullet of its own (it inherits it through "Everything in Growth")
- [ ] Trial transaction cap (100) is high enough for a real 14-day trial
- [ ] Margin per plan checked after fees (Razorpay fee, referral revenue share, GST on your own subscription)
- [ ] "Message costs beyond your plan's cap are billed at actuals" is either implemented (message metering) or removed from the page

## Data and infrastructure

- [ ] MongoDB is a replica set (stock and credit writes rely on transactions)
- [ ] Atlas backups enabled, and a restore tried at least once
- [ ] Indexes: `autoIndex` is still on. Fine for an empty database; revisit once there is real data
- [ ] Only one backend instance runs (the message queue can send a message twice if two instances drain it at once)
- [ ] Error monitoring (for example Sentry) and an uptime check on `/api/health`

## Tax and legal (Phase 3b)

- [ ] A CA has reviewed a sample GST invoice: GSTIN, HSN codes, rates, CGST/SGST vs IGST, round-off, numbering format
- [ ] Invoice numbering tested for gaps and duplicates, including the April financial-year rollover
- [ ] Timber volume formula confirmed with a real timber merchant
- [ ] Privacy policy and terms of service pages exist (you store customer names and phone numbers)

## Product checks with real users

- [ ] One real pump owner or manager has walked through the shift close flow (test litres, cash count)
- [ ] One real timber yard has walked through a sale with dimensions and GST
- [ ] Tested on a real low-end Android phone and a slow network

## UI screen checklist: open items (2026-11-23)

Found during the DESIGN.md section 13 pass over every page and layout. Each one was left alone because the fix changes behaviour, needs a design or backend decision, or is bigger than a small edit.

**Verification gap**
- [ ] **Run `npm run lint` and `npm run build` in `frontend/`, then click through the open states by hand.** Node was not available in the environment that made these edits, so ESLint, Prettier and Vite did not run. Only an esbuild bundle (syntax and imports) and a static render in headless Chrome with mocked data were done. Dialogs, error states, loading states and submits were not exercised in a browser (see QA.md section 7).

**Layout**
- [ ] **Wide tables scroll inside their own box on phones instead of becoming stacked cards** (DESIGN section 8). Affects Inventory, Messages, Sales report, Pump Report (three tables) and Timber Reports. The page itself does not scroll sideways, but the tables are awkward on a phone. Needs a responsive `Table` component.

**Units and formatting that need data the screen does not have**
- [ ] **Dashboard "Opening stock" and "Dispensed / sold" show no unit.** The backend adds the quantities of every item together (`dashboard.controller.js`), so there is no single unit. Return a unit or per-item totals, then show them.
- [ ] **Sales report "Quantity" column has no unit and can add litres to kilograms** when grouped by day or payment mode. Needs a unit per row or a split by unit from the API.
- [ ] **Timber Reports show raw numbers** for every report except the GST summary amounts (fixed). The columns come from the server, so the screen cannot tell money from quantity. Have the API send a type per column.

**Accessibility that changes behaviour**
- [ ] **Modal has no `role="dialog"`, `aria-modal`, focus trap, focus return or Esc to close** (DESIGN section 9). Only the close button was fixed. Doing the rest changes keyboard behaviour for every dialog.
- [ ] **Form errors are not linked to their fields** (`aria-describedby`, `aria-invalid`), and `Input`'s `error` prop is not used by any page.
- [ ] **Text contrast and 10px labels** (DESIGN section 9 and 12): `slate-400` mono labels, inactive bottom-nav items, placeholder text, coral text on white and white text on coral buttons. Needs the darker coral token to be chosen first.
- [ ] **Bottom-nav labels are 10px.**

**Behaviour left as it is**
- [ ] **Transaction detail "Retry message" reloads the whole page** (`location.reload()`) and has no error handling, so a failed retry shows nothing.
- [ ] **Transaction detail shows "Transaction not found." for any load failure**, including a network error. It cannot tell the two apart.
- [ ] **Delete workspace, delete inventory item and remove item type use `window.confirm`**, not the shared `Modal` with a reason (DESIGN button rules).
- [ ] **Item filters hard-code Diesel, Petrol and CNG** (`ItemTypeFilter`, `ItemTypeSelector`), so a timber or other workspace cannot filter transactions by its own items.
- [ ] **Inventory page: if the list fails to load, it shows the error and also "No inventory items yet".**
- [ ] **Not every sending button uses the shared `loading` prop.** The inventory row save icon, the Workspaces "Switch" buttons (one shared flag) and the signed-in Pricing plan buttons disable themselves and block a second tap, but show no spinner. Spinners need a per-row or per-plan flag and, for Pricing, a restyle of the button.
- [ ] **Dashboard greeting always says "Good morning."**

**Design system (DESIGN section 12, not touched)**
- [ ] **Raw hex in `index.css`** (`#191c21`, `#111827`, `#cc8066`), leftover Vite CSS in `App.css`, and `rounded-lg` and `rounded-[6px]` on a few pages. The dot-texture hex in Login and Signup was replaced with a Tailwind token.
- [ ] **Status colors are still ad hoc Tailwind classes**, with no shared `Badge`, `Alert`, `Table` or `Card`. Status always has text or an icon next to the color on the screens checked.
- [ ] **Login, Signup and Pricing footer links (Privacy, Terms, Status) point to `#`.** This links to the existing item about privacy policy and terms pages.

## Resolved

| Date | Item | Note |
|---|---|---|
|  |  |  |
