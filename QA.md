# Fuelo: End-to-End QA Checklist

Tick items as you verify them. Write the date and a short note on any failure (exact steps + what you saw), then bring it back to be fixed.

Legend: `[ ]` not tested · `[x]` passed · `[!]` failed (add a note below the item)

---

## 0. Staging setup (do this first)

- [ ] Set `DATABASE_URL`, `JWT_SECRET` (32+ characters), `CORS_ORIGINS` and `PUBLIC_APP_URL` to the staging values. Set `TRUST_PROXY_HOPS=1` if staging has exactly one trusted proxy.
- [ ] Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_FROM`. For business-initiated invites and resets, set `TWILIO_WHATSAPP_INVITE_CONTENT_SID` and `TWILIO_WHATSAPP_OTP_CONTENT_SID` to approved templates. For sandbox tests, join the sender with the test phone.
- [ ] For Hinglish OTP and invite delivery, configure `TWILIO_WHATSAPP_OTP_CONTENT_SID_HI` and `TWILIO_WHATSAPP_INVITE_CONTENT_SID_HI` with approved templates. Without them, the standard configured SIDs are used.
- [ ] For WhatsApp delivery outside the 24-hour conversation window, configure approved `TWILIO_WHATSAPP_DUES_REMINDER_CONTENT_SID` and `TWILIO_WHATSAPP_SHIFT_VARIANCE_CONTENT_SID` templates. Set the matching `_HI` variables for approved Hinglish versions. Use placeholders 1 (business), 2 (customer), 3 (amount) for dues, and 1 (business), 2 (signed amount) for alerts.
- [ ] Razorpay **test-mode** keys set (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`)
- [ ] Six Razorpay test plans created and `RAZORPAY_PLAN_<STARTER|GROWTH|BUSINESS>_<MONTHLY|YEARLY>` set
- [ ] Razorpay webhook URL points to `https://<backend>/api/billing/webhook`
- [ ] From `backend/`, rerun `node scripts/seedPlans.js`. With all six test plan IDs configured, the output shows `seeded: 6` and `skipped: 0`. This refreshes the Growth and Business plan templates with the pump and timber pack features.
- [ ] Prepare disposable workspaces for the credit-limit, month-cap, expired-trial, and failed-payment checks. Use staging fixtures for a customer credit limit, 79 and 100 non-voided sales in the current IST month, an expired `trialEndsAt`, and `pastDueSince` fixtures inside and beyond the three-day grace period.
- [ ] Prepare an isolated timber Trial or Business workspace with an owner, manager, and attendant. Use sample GST and supplier data and a test phone for messaging. Trial, Growth and Business can run the CSV checks.
- [ ] After reseeding plans, open **Purchases** on a timber Starter workspace. The upgrade dialog appears.
- [ ] Frontend `VITE_API_BASE_URL` points to `https://<backend>/api`
- [ ] `GET https://<backend>/api/health` returns `{ ok: true }`
- [ ] Prepare a disposable fuel trial workspace with owner, manager and attendant logins. Use this workspace or a Growth or Business workspace for the pump CSV check.
- [ ] For the combined pump run, create the diesel tank described below, set Diesel to ₹100 per litre in **Inventory**, and save ₹250 as the **Shift variance alert threshold** in **Settings → Pump settings**.
- [ ] GitHub Actions is green on `main`
- [ ] `npm test` passes locally

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
- [ ] From `backend/`, run `npm test`. All tests pass.
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
- [ ] In a trial, Growth or Business workspace, choose **Download CSV**. The downloaded file opens with the selected IST date's tank and shift rows.
- [ ] In a separate staging run, void an earlier IST date's delivery with stock available. The original date no longer includes it in deliveries. The original posting and later reversal appear under **Other adjustments** on their respective dates.

### Fleet credit
- [ ] Open **Credit / Udhaar** with two dated credit sales. Confirm the older age is shown. Pay that sale in full and confirm the age advances to the second unpaid sale.
- [ ] Set credit terms for that customer. Apply **Minimum days overdue** below and above the calculated age after terms, and verify the customer appears only for the matching filter.
- [ ] Send a **dues reminder** on a customer with a balance. The UI confirms it was queued.
- [ ] Resend the same customer reminder within 24 hours. The UI reports that a reminder was already queued.

---

## 5. Phase 3b: Timber pack

### Timber items and dimensions

- [ ] Configure a Teak A item priced at ₹100 per cubic foot. Record 10 cubic feet and 15 pieces as opening stock. Inventory shows both values.
- [ ] Sell three pieces measuring 8 ft × 6 in × 2 in with a ₹25 transport charge. The quantity is 2 cubic feet and the sale total is ₹225.
- [ ] Void that sale with a reason. Inventory returns to 10 cubic feet and 15 pieces.

### Purchases and suppliers

- [ ] Add a supplier with a ₹40 opening balance. The supplier ledger shows the opening adjustment and ₹40 payable.
- [ ] Enter a ₹100 purchase of three pieces totaling 2 cubic feet, with ₹25 paid. Stock increases by 2 cubic feet and three pieces, and the payable becomes ₹115.
- [ ] Enter a ₹200 supplier payment against that ₹115 balance without marking it as an advance. The app rejects it and the balance stays ₹115.
- [ ] Void the purchase with a reason while all three pieces remain in stock. Quantity and pieces reverse and the supplier balance becomes ₹15.
- [ ] Record a ₹25 supplier payment with **Advance** selected. The ledger shows a ₹10 supplier advance.

### Part payments and advances

- [ ] Record ₹4,000 cash on a ₹10,000 sale. The customer ledger shows a ₹4,000 sale payment and ₹6,000 due.
- [ ] Enable **Customer advances** in the timber workspace settings, then record a ₹7,000 payment. The ledger shows ₹1,000 as **Customer credit**.
- [ ] Create another sale with ₹2,000 unpaid. The sale applies ₹1,000 customer credit and the ledger shows ₹1,000 still due.

### GST invoices and credit notes

- [ ] As an owner, enter the tax profile with the GSTIN checksum changed. The form rejects it.
- [ ] Save a valid tax profile and configure a timber item's HSN and GST rate. Record a same-state sale and confirm the preview and invoice show CGST and SGST.
- [ ] Record a sale with a different place-of-supply state. The preview and invoice show IGST.
- [ ] Download a tax invoice PDF. Confirm the invoice number, seller, buyer, line taxes, round-off, total in words and payment breakdown.
- [ ] Open the tax sale's transaction detail as manager. **Manage credit note in invoice** opens the invoice, where **Issue credit note** is available.
- [ ] Issue a credit note with a reason. The original invoice remains visible, the stock returns, and the customer ledger records the reversal.
- [ ] With a single invoice and its full credit note on the same IST day, run **GST summary** for that day. The item's taxable value and tax net to zero and the accountant-facing note is visible.

### Timber reports and messages

- [ ] Open **Timber Reports → Stock** after receiving a purchase. Confirm species, grade, price, billed quantity and pieces.
- [ ] View **Sales by species** after selling two grades. Check that their sales are grouped under the species and pricing unit.
- [ ] Open **Receivables aging** with a part-paid customer invoice. The unpaid amount appears in the band for the sale date.
- [ ] Enter a supplier invoice dated 45 days ago and open **Payables aging**. Its unpaid amount appears in **31–60 days**.
- [ ] Open **Profit estimate** for a sale with a recorded purchase cost. Check that the estimate uses the weighted-average purchase rate.
- [ ] In a Trial, Growth or Business workspace, download a CSV for each report. On a Starter workspace, confirm the CSV button shows the upgrade dialog. The downloaded headers and rows match the page.
- [ ] Record a timber sale with a test phone. The receipt lists pieces and dimensions in the workspace language.
- [ ] Record a purchase for a supplier with a test phone. The message identifies the supplier invoice.

### Navigation and permissions

- [ ] On a phone, open the Timber workspace and reach **Purchases**, **Suppliers**, **Invoices**, and **Timber Reports** from the operations navigation.
- [ ] Sign in as an attendant, open **New transaction**, and select a timber grade. The dimension inputs are available.
- [ ] As that attendant, try opening the Purchases and Suppliers pages directly. Access is denied.
- [ ] As that attendant, open a tax sale the attendant recorded. The credit-note action is unavailable.
- [ ] Switch to a fuel workspace. Timber entries disappear from the operations navigation.
- [ ] Open **New transaction** in that fuel workspace. The single-item sale form appears.

## 6. Cross-cutting checks

- [ ] Cross-tenant: create two workspaces with different owners; confirm owner B can never see A's customers, sales, stock or reports (try pasting A's IDs into B's URLs)
- [ ] On the pump staff phone, open a shift, record a sale and open the close form. The nozzle readings, payment inputs and submit controls are usable at the phone width.
- [ ] Slow network (throttle in browser dev tools): forms don't double-submit on repeated taps
- [ ] Back button / refresh mid-flow does not lose or duplicate a sale
- [ ] Browser console shows no errors during the above
- [ ] Force a receipt delivery to fail on staging. It appears as **Failed** in **Messages**, and using **Retry** queues it again.
- [ ] End-of-day summary arrives at ~23:55 IST with correct units and totals
- [ ] On a single staging backend instance, restart with a receipt still pending. **Messages** shows the delivery attempt after the worker resumes.

## 7. Screen checklist pass (added 2026-11-23)

Run each check at 360px (phone), 768px and 1280px in the real browser with real data. "No sideways scroll" means the page itself does not scroll horizontally. A table that scrolls inside its own box is a known open item (see CHECKS.md). Touch targets should be at least 44px tall.

### Shared behaviour

- [ ] Every button that sends a request (save, confirm, retry, download, void, switch) shows a spinner and ignores a second tap while the request is in flight. Throttle the network to check.
- [ ] Every dialog's **×** close button has a 44px target and is announced as "Close" by a screen reader. Toasts announce themselves and the dismiss button is announced as "Dismiss".

### Public pages

- [ ] **Login:** the phone field opens the phone keypad. "Forgot password?" and the header and footer links are easy to tap. The faint dot texture still shows on the right panel.
- [ ] **Signup:** the phone field opens the phone keypad. The business-type pills are at least 44px tall. The faint dot texture still shows.
- [ ] **Pricing:** prices show as `₹499`, `₹4,990` and so on, with no decimals. The Monthly/Yearly toggle and the plan buttons are easy to tap. While checkout starts, the signed-in button reads "Starting checkout…" and cannot be tapped twice.

### Dashboard and transactions

- [ ] **Dashboard:** a long customer name in Recent transactions does not widen the page at 360px. The inventory box says "No stock movement recorded today." on a quiet day. If the summary request fails, a red message appears above the cards. "View inventory" and "View all" are easy to tap.
- [ ] **New transaction:** the quantity and amount fields open the decimal keypad. The "Auto: ₹…" hint under Amount uses Indian grouping. "Use list price", "Preview message" and the customer suggestions are easy to tap.
- [ ] **Transactions:** if the list request fails, a red message shows instead of "No transactions found". "New" is 44px tall on desktop.
- [ ] **Transaction detail:** "Download PDF receipt" shows a spinner and cannot be tapped twice. The quantity shows its unit. "Open invoice", "View customer ledger" and "Manage credit note in invoice" are easy to tap.

### Credit, stock and reports

- [ ] **Credit:** a long customer name wraps and does not push the balance off screen at 360px. In **Record payment** the amount field opens the decimal keypad, and the payment-mode select is 44px tall. "Back to Credit / Udhaar" and "View transaction" are easy to tap.
- [ ] **Inventory (fuel):** stock shows with Indian grouping and its unit. Price shows as `₹106.31`. The edit, save, cancel and delete icons are 44px and announced with the item name. Tapping Delete twice quickly asks only once and removes only that item. "Add to Inventory" shows a spinner while saving. Clicking a form label focuses its field.
- [ ] **Reports:** an empty range shows "No sales in this date range." The Group by select is 44px tall.
- [ ] **Messages:** if the request fails, a red message shows. Retry shows a spinner on the row being retried, and the date uses Indian formatting.
- [ ] **Activity log:** a very long action code or summary wraps and does not widen the page at 360px.

### Team, settings and billing

- [ ] **Members:** the Role select is 44px tall in the list and in the invite dialog. The invite phone field opens the phone keypad.
- [ ] **Settings:** the save, add and change-password buttons show a spinner while sending. The remove-item trash icon is 44px and announced with the item name. Clicking each form label focuses its field. The dips checkbox row is easy to tap.
- [ ] **Billing:** usage reads like "1,234 / 1,500 transactions" and "3 / 5 members". "View plans" is 44px tall.
- [ ] **Workspaces:** at 360px the row wraps and the Switch and delete buttons stay on screen. The trash icon is 44px and announced with the workspace name. "Create Workspace" shows a spinner. Clicking a form label focuses its field.

### Pump pages

- [ ] **Pump shifts:** the meter, test-litre and declared-payment fields open the decimal keypad. Declared Cash, UPI and Card labels show (₹). Every variance pill says "Matches" or "Needs review" as well as using color.
- [ ] **Pump tanks and deliveries:** the quantity, capacity, meter and rate fields open the decimal keypad. The rate label shows (₹). The tank select and the over-capacity checkbox row are 44px tall.
- [ ] **Pump report:** the shift table shows hours with "h" and litres with "L". A shift with a variance also says "Needs review" in its variance cell.

### Timber pages

- [ ] **Timber inventory:** while loading it says "Loading timber stock…". An empty yard says to add the first item. Stock shows up to 3 decimals with its unit, and price reads "per Cubic feet" (or the item's unit) instead of "per unit". The price, thickness, quantity and GST fields open the decimal keypad and pieces opens the number keypad.
- [ ] **Suppliers:** "Outstanding payables" shows a spinner while loading. The header buttons wrap at 360px. The phone field opens the phone keypad and the payment amount opens the decimal keypad.
- [ ] **Purchases:** while loading it says "Loading purchases…". Line quantities show with up to 3 decimals. Each purchase row is easy to tap open.
- [ ] **Invoices:** while loading it says "Loading invoices…". The invoice and credit-note PDF buttons show a spinner and cannot be tapped twice. "Back to invoices" is easy to tap.
- [ ] **Timber reports:** the GST summary shows ₹ amounts for taxable value, CGST, SGST and IGST. "Download CSV" shows a spinner and cannot be tapped twice.

### Navigation

- [ ] **App shell, top bar and bottom nav:** the back arrow and the bell are 44px and announced as "Go back" and "Notifications". The workspace switcher announces whether it is expanded. Sidebar links, "Sign out" and the mobile operations strip are at least 44px tall. The page loading text is announced.

### Follow-up changes (added 2026-11-23)

- [ ] **Item filter on Transactions:** in a fuel workspace the pills are the configured items (Diesel, Petrol, CNG if nothing is configured). In a timber workspace they are the configured timber items, not Diesel, Petrol or CNG. Selecting pills filters the list. A workspace with no items shows no filter.
- [ ] **Item type on New transaction:** a fuel workspace shows its configured items. A timber workspace shows the timber sale form with its own items.
- [ ] **Transaction detail, not found:** open `/transactions/<a made-up id>`. It says the transaction was not found and offers a link back to Transactions, with no Retry button.
- [ ] **Transaction detail, load failure:** turn the network off (or stop the backend) and open a real transaction. A red message with a **Retry** button appears. Turn the network back on and tap Retry. The transaction loads without a page reload.
- [ ] **Dashboard greeting:** it says Good morning before noon, Good afternoon from noon to 5pm and Good evening after that, using the phone's clock. Signed in fresh (log out and in), it adds your first name. If your account name is the same as the business name, no name is added.
- [ ] **Dashboard "Dispensed / sold":** with sales in two units (for example litres and kilograms) each unit has its own line and the two are not added together.
- [ ] **Terms and Privacy:** the footer on Login, Signup and Pricing links to `/terms` and `/privacy`. Both open while signed out and say they are placeholder text. The footer no longer has a Status link.
- [ ] **Inventory delete:** the trash icon opens a dialog naming the item. Cancel closes it with nothing deleted. **Delete item** shows a spinner, removes only that item, and shows the same "removed" message as before. Close and Cancel are disabled while it runs.

### Onboarding checklist (added 2026-11-23)

- [ ] **New fuel workspace:** sign up, and the Dashboard shows a **Get started** card with "0 of N steps done". Steps are items and prices, tank and nozzle, first sale, and an optional team invite.
- [ ] **New timber workspace:** the card shows timber items, supplier, purchase, first sale and the optional team invite. Tank and nozzle is not listed.
- [ ] **Steps tick from real data:** add an item with a price, add a tank and a nozzle, record a sale, and invite a member. After each, reload the Dashboard and that step reads **Done** (the word, not only the tick) and loses its Open button.
- [ ] **Open buttons:** each **Open** link goes to the right page (Inventory, Tanks, Suppliers, Purchases, New transaction, Members).
- [ ] **Permissions:** sign in as an attendant. Steps they cannot do (inventory, tanks, members) are not listed. A user with no listed steps sees no card.
- [ ] **Hide checklist:** the button removes the card and it stays hidden after a reload. Another workspace of the same user still shows its own card.
- [ ] **Finished workspace:** once every required step is done (the team invite is optional), the card disappears by itself.
- [ ] **Phone:** at 360px the card does not scroll sideways and the Open and Hide buttons are at least 44px tall.

### Tank gauges (added 2026-11-24)

- [ ] **Tanks page, colors by fuel:** with a Petrol, a Diesel and a CNG tank, each tank gauge has its own color (Petrol blue, Diesel purple, CNG teal) and the fuel name is written next to a colored dot. Any other fuel gets a stable color of its own.
- [ ] **Fill level matches the numbers:** a tank holding 62% of its capacity fills about 62% of the gauge, and the card says "62% · 12,345 L of 20,000 L". The dashed line on the gauge sits at 20%.
- [ ] **Low, empty and over capacity:** a tank at or under 20% shows an amber **Low** badge with a warning icon. A tank at 0 shows **Empty**. A tank above its capacity shows **Over capacity**. The fill color does not change; the badge is the signal.
- [ ] **Last dip on the card:** after recording a dip, reload the Tanks page. The card says "Last dip … L on <date> · variance … L". A tank with no dip says "No dip recorded yet."
- [ ] **Record delivery from a tank card:** the button opens the delivery dialog with that tank already selected. The top "Record delivery" button still opens it with the first tank selected.
- [ ] **Attendant view:** an attendant who can only record dips sees no gauge, no book stock and no delivery button on the Tanks page, as before.
- [ ] **Dashboard tank levels:** a fuel workspace with tanks shows a "Stock in your tanks" row with one small gauge per tank, linking to the Tanks page. It is hidden for timber workspaces, for users who cannot manage tanks, and when there are no tanks. At 360px it does not scroll sideways.
- [ ] **Reduced motion:** with "reduce motion" turned on in the operating system, the gauge fill does not animate.

---

## Failure log

| Date | Item | Steps to reproduce | What happened | Status |
|---|---|---|---|---|
|  |  |  |  |  |
