# Fuelo: End-to-End QA Checklist

Tick items as you verify them. Write the date and a short note on any failure (exact steps + what you saw), then bring it back to be fixed.

Legend: `[ ]` not tested · `[x]` passed · `[!]` failed (add a note below the item)

---

## 0. Staging setup (do this first)

- [ ] MongoDB Atlas cluster created (replica set, which Atlas gives by default). Database user + IP access list set.
- [ ] Set `MONGO_URI`, `JWT_SECRET` (32+ characters), `CORS_ORIGINS` and `PUBLIC_APP_URL` to the staging values. Set `TRUST_PROXY_HOPS=1` if staging has exactly one trusted proxy.
- [ ] Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_FROM`. For business-initiated invites and resets, set `TWILIO_WHATSAPP_INVITE_CONTENT_SID` and `TWILIO_WHATSAPP_OTP_CONTENT_SID` to approved templates. For sandbox tests, join the sender with the test phone.
- [ ] For Hinglish OTP and invite delivery, configure `TWILIO_WHATSAPP_OTP_CONTENT_SID_HI` and `TWILIO_WHATSAPP_INVITE_CONTENT_SID_HI` with approved templates. Without them, the standard configured SIDs are used.
- [ ] For WhatsApp delivery outside the 24-hour conversation window, configure approved `TWILIO_WHATSAPP_DUES_REMINDER_CONTENT_SID` and `TWILIO_WHATSAPP_SHIFT_VARIANCE_CONTENT_SID` templates. Set the matching `_HI` variables for approved Hinglish versions. Use placeholders 1 (business), 2 (customer), 3 (amount) for dues, and 1 (business), 2 (signed amount) for alerts.
- [ ] Razorpay **test-mode** keys set (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`)
- [ ] Six Razorpay test plans created and `RAZORPAY_PLAN_<STARTER|GROWTH|BUSINESS>_<MONTHLY|YEARLY>` set
- [ ] Razorpay webhook URL points to `https://<backend>/api/billing/webhook`
- [ ] From `backend/`, run `node scripts/migrateToMemberships.js --dry-run` against staging. Confirm the summary matches the expected legacy workspaces before running it again without `--dry-run`.
- [ ] From `backend/`, rerun `node scripts/seedPlans.js`. With all six test plan IDs configured, the output shows `seeded: 6` and `skipped: 0`. This refreshes the Growth and Business plans with the pump-pack feature.
- [ ] Prepare disposable workspaces for the credit-limit, month-cap, expired-trial, and failed-payment checks. Use staging fixtures for a customer credit limit, 79 and 100 non-voided sales in the current IST month, an expired `trialEndsAt`, and `pastDueSince` fixtures inside and beyond the three-day grace period.
- [ ] Frontend `VITE_API_BASE_URL` points to `https://<backend>/api`
- [ ] `GET https://<backend>/api/health` returns `{ ok: true }`
- [ ] Prepare a disposable fuel trial workspace with owner, manager and attendant logins. Use this workspace or a Business workspace for the pump CSV check.
- [ ] For the combined pump run, create the diesel tank described below, set Diesel to ₹100 per litre in **Inventory**, and save ₹250 as the **Shift variance alert threshold** in **Settings → Pump settings**.
- [ ] GitHub Actions is green on `main`
- [ ] `npm test` passes locally in both modes (replica set, and `FUELO_TEST_STANDALONE=1`)

---

## 1. Phase 0: Connection, signup, receipts

- [ ] Open `/signup`, create a **fuel** workspace, land on the dashboard
- [ ] Sign out, then sign back in with the same phone and password
- [ ] Wrong password shows an error (no crash)
- [ ] Record a transaction (customer name, phone, quantity, amount). It appears in transaction history
- [ ] Generate a receipt link; open it **twice** in a private window. Both opens show the right business name and transaction
- [ ] Open the receipt link after its expiry time (or expire it in the DB): the expired screen shows
- [ ] Transaction detail: **Download PDF receipt** shows the right business name and transaction
- [ ] WhatsApp receipt message arrives on the customer phone and shows **your workspace name**, not any other name
- [ ] From a fresh test IP, submit 30 wrong passwords within 15 minutes. The 31st attempt returns a rate-limit error. Sign-in works again after the window resets.
- [ ] While the first test IP is blocked, sign in from a different network. The second network can log in through the same staging proxy.
- [ ] Alternate successful sign-ins between two users on the same Wi-Fi more than 30 times. Successful sign-ins leave the login budget available.

## 2. Phase 1: Stock, prices, credit, reports

- [ ] **Inventory:** set Diesel stock to **5 litres** at **₹100/litre**
- [ ] Record a **2-litre credit sale**. Amount autofills to ₹200; change it to ₹190 and confirm the **price-differs warning**
- [ ] After saving, stock shows **3 litres**
- [ ] **Credit / Udhaar** page: the customer owes **₹190**; total outstanding is correct
- [ ] Record a **₹50 payment**; the ledger shows **₹140 outstanding**
- [ ] A WhatsApp payment-received message arrives
- [ ] Try to pay more than the outstanding balance: it is rejected
- [ ] As an owner or manager, sell on credit to the staged customer with a preset credit limit. Exceed the limit and confirm the sale is rejected. Select **Allow this sale to exceed the credit limit** and resubmit to confirm the authorized override succeeds.
- [ ] **Void** the sale with a reason: history shows **Voided**, stock returns to **5 litres**, the ledger shows **₹50 Customer credit** and no dues
- [ ] Voided sales are excluded from dashboard totals
- [ ] Try to sell more than the available stock: rejected with a clear message
- [ ] Two phones selling the last litres at the same time: no overselling (stock never goes negative)
- [ ] Change Diesel's price in **Inventory** and reopen **New transaction**. Enter a quantity and confirm the amount autofills using the new price.
- [ ] In daily **Reports**, use fixture sales at 00:30 and 23:50 IST on one date and 00:30 IST the following day. The first two appear on the first date and the third on the next date.
- [ ] **Reports:** sales by day / item / payment mode; totals match your transactions; voids excluded
- [ ] Reports CSV export opens in Excel with correct columns (group by item and try an item name containing a comma and a quote)

## 3. Phase 2: Users, roles, sessions, billing

### Trial and signup
- [ ] New signup shows the **14-day trial** banner

### Members and roles
- [ ] As owner, invite an attendant from **Members**; the WhatsApp invite arrives
- [ ] Open the invitation in a separate browser, set a password, and sign in. TopBar shows **Attendant** for the invited workspace.
- [ ] Open the same link again and submit it. The page reports an invalid or expired invitation.
- [ ] Attendant can record a **cash sale**
- [ ] Attendant does **not** see Reports, Inventory edits, Credit payments or **Void transaction**
- [ ] Attendant sees only **their own** transactions from **today** (not yesterday's, not others')
- [ ] Try attendant URLs directly (e.g. `/reports`): blocked
- [ ] Invite a **manager**: can void, record payments, edit inventory, view reports; **cannot** open Billing or manage Members
- [ ] Owner cannot remove or demote the **last owner**; a user cannot change their own role

### Sessions
- [ ] Owner **disables** the attendant; the attendant's open tab returns to login within ~30 seconds
- [ ] Change password: the current device stays logged in; other devices are logged out
- [ ] Access token expiry (~15 min) refreshes silently without kicking you to login
- [ ] **Forgot password:** request OTP, receive the WhatsApp code, set a new password, and log in with it. The old password fails
- [ ] For a fresh OTP, submit five incorrect codes, then submit the correct code. The page rejects it as invalid or expired.
- [ ] In **Forgot password**, request a code and resend within 60 seconds. Only the first code arrives.
- [ ] Request a reset code for an unregistered phone. The browser displays the same generic response as it does for a registered phone.

### Audit log
- [ ] Void a sale, then open **Activity log** as owner. Filtering by `transaction.void` shows the action, actor and time.
- [ ] Change a price, then filter **Activity log** by `price.update`. The corresponding price change appears.
- [ ] Transaction detail shows **recorded by** the right user

### Plans and billing
- [ ] **Billing** page shows plan, trial days left, and usage vs limits
- [ ] Choose a plan on **Pricing**; Razorpay test checkout opens and completes with a test card
- [ ] After payment, the webhook activates the subscription (status becomes **active**)
- [ ] Cancel the subscription: it stays active until the end of the billing cycle
- [ ] On a trial fixture with 79 non-voided sales in the current IST month, save another sale. Sale 80 succeeds and the usage warning appears.
- [ ] On a trial fixture with 100 non-voided sales in the current IST month, save another sale. The upgrade modal reports that the monthly limit was reached.
- [ ] **Seat test:** invite beyond the plan's seat limit and get a clear upgrade message
- [ ] Open an expired-trial fixture. The read-only banner appears.
- [ ] Try to save a sale on the expired-trial fixture. The upgrade modal reports that the trial ended.
- [ ] Open **Credit / Udhaar** on the expired-trial fixture. Existing balances remain visible, and submitting a new payment shows the upgrade modal.
- [ ] Submit a new invite on the expired-trial fixture. The upgrade modal appears and the member list stays unchanged.
- [ ] On the expired-trial fixture, export a CSV from **Reports**. The file downloads with the existing sales.
- [ ] Open a past-due fixture within its three-day grace period, then open one beyond it. A sale saves within grace, and the older fixture shows the read-only banner.
- [ ] Revenue-share transfer (referred workspace): runs on a test charge (only if you've set up a linked account)

### Multi-workspace
- [ ] Create a second workspace; switch between them; data does not leak across
- [ ] Creating a 3rd workspace on a plan that does not allow it shows the upgrade message
- [ ] A user belonging to two workspaces logs in to the most recently used one

### Credit labels
- [ ] A negative balance is labelled **Customer credit**, not "Dues"

---

## 4. Phase 3a: Pump pack

### Tests cleanup
- [ ] From `backend/`, run `npm test` with a replica set and with `FUELO_TEST_STANDALONE=1`. All tests pass in both modes.
- [ ] Run `npm run test:coverage` from `backend/`. The report includes lines, branches, and functions.

### Setup
- [ ] Open **Shifts** in a fuel workspace on Starter. The upgrade dialog opens.
- [ ] Open **Shifts** in a trial or Growth fuel workspace. The shift page loads.
- [ ] Switch to a non-fuel workspace. Pump pages are hidden from navigation.
- [ ] As owner, set **Message language** to **English** in **Settings**, save, then record a sale. The test phone receives an English receipt.
- [ ] Set **Message language** to **Hinglish**, save, then record another sale. The receipt includes “aapka transaction record”.

### Tanks and deliveries
- [ ] In **Tanks & Deliveries**, select **Add tank** and create a 500-litre Diesel tank. The card shows 0 of 500 litres.
- [ ] Select **Add nozzle**, choose that tank and enter an opening meter of 1000 litres. The nozzle shows a 1000-litre last reading.
- [ ] Record a 250-litre delivery for the combined pump run. The delivery appears in history and the tank shows 250 of 500 litres.
- [ ] Record a 100-litre **tanker delivery**. The tank book stock and inventory total each increase by 100 litres.
- [ ] Submit a delivery that would exceed capacity. It is rejected and stock stays unchanged.
- [ ] Retry the overfill as an owner or manager with override. Stock increases and the override appears in the delivery audit entry.
- [ ] Void a delivery with a reason. Its status shows **Voided** and the tank and inventory each reverse the received litres.

### Shifts
- [ ] Open a shift using the nozzle's last meter reading. The shift appears as open.
- [ ] Enter a different opening meter without an explanation. Opening is rejected until you provide one, and the override appears in **Activity log**.
- [ ] With a shift open, sign in as another staff member and attempt to open one. The second shift is rejected.
- [ ] During the shift, record a 10-litre Diesel credit sale with vehicle `ka 01 ab 1234`. Its transaction detail shows `KA01AB1234` and the active shift shows ₹1,000 in credit sales.
- [ ] Open a new credit sale for the same customer and choose `KA01AB1234` from the fleet picker. The vehicle field fills in.
- [ ] Close the combined-run shift with meter 1032, 2 test litres, ₹1,700 cash and zero UPI or card. The preview and closed shift show a −₹300 variance against ₹3,000 expected sales.
- [ ] Check the owner's staging WhatsApp after the close. The owner receives one variance alert for the −₹300 shortfall.
- [ ] Enter a closing meter lower than the opening meter. The shift stays open and the form reports the reading is invalid.
- [ ] In the browser's Network panel, resend the successful close request. The response shows the same close result and refreshing **Tanks & Deliveries** shows the same stock.
- [ ] Check stock after the combined-run close. The tank and Diesel inventory each show 220 litres, a 30-litre decrease since the delivery.
- [ ] Inspect the combined-run shift. It shows 30 litres sold after deducting the 2 test litres from the 32-litre meter change.
- [ ] Sign in as an attendant while someone else's shift is open. Closing it is unavailable.
- [ ] Sign in as an attendant after a shift closes. Reopening is unavailable.
- [ ] As manager, reopen the latest shift with a reason within 24 hours. Only the meter close adjustment is reversed, and the individual credit sale stays recorded.

### Dips and reports
- [ ] In **Tanks & Deliveries**, record a 218-litre dip with the combined-run book stock at 220 litres. The result shows a −2-litre variance.
- [ ] As attendant, try recording a dip with attendant dips disabled. The action is blocked. Enable attendant dips as owner and confirm the attendant can record one.
- [ ] Open **Pump Report** for the IST date with the dip. Check that opening, deliveries, sales adjustments and closing reconcile.
- [ ] Open the combined-run **Pump Report**. With 30 litres of throughput and the default 0.5% threshold, the −2-litre dip variance is highlighted.
- [ ] In the trial or Business workspace, choose **Download CSV**. The downloaded file opens with the selected IST date's tank and shift rows.
- [ ] In a separate staging run, void an earlier IST date's delivery with stock available. The original date no longer includes it in deliveries. The original posting and later reversal appear under **Other adjustments** on their respective dates.

### Fleet credit
- [ ] Open **Credit / Udhaar** with two dated credit sales. Confirm the older age is shown. Pay that sale in full and confirm the age advances to the second unpaid sale.
- [ ] Set credit terms for that customer. Apply **Minimum days overdue** below and above the calculated age after terms, and verify the customer appears only for the matching filter.
- [ ] Send a **dues reminder** on a customer with a balance. The UI confirms it was queued.
- [ ] Resend the same customer reminder within 24 hours. The UI reports that a reminder was already queued.

---

## 5. Cross-cutting checks

- [ ] Cross-tenant: create two workspaces with different owners; confirm owner B can never see A's customers, sales, stock or reports (try pasting A's IDs into B's URLs)
- [ ] On the pump staff phone, open a shift, record a sale and open the close form. The nozzle readings, payment inputs and submit controls are usable at the phone width.
- [ ] Slow network (throttle in browser dev tools): forms don't double-submit on repeated taps
- [ ] Back button / refresh mid-flow does not lose or duplicate a sale
- [ ] Browser console shows no errors during the above
- [ ] Force a receipt delivery to fail on staging. It appears as **Failed** in **Messages**, and using **Retry** queues it again.
- [ ] End-of-day summary arrives at ~23:55 IST with correct units and totals
- [ ] On a single staging backend instance, restart with a receipt still pending. **Messages** shows the delivery attempt after the worker resumes.

---

## Failure log

| Date | Item | Steps to reproduce | What happened | Status |
|---|---|---|---|---|
|  |  |  |  |  |
