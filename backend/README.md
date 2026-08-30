# Fuelo Backend (Node/Express)

Config-driven, multi-vertical WhatsApp invoicing & credit-tracking backend.
Every tenant-scoped collection carries `workspaceId`; business-type logic
lives in `Dealer.config`, not in hardcoded route branches.

## Setup

```bash
npm install
cp .env.example .env   # fill in Mongo URI, JWT secret, Twilio, Razorpay
npm run dev
```

## Key architectural patterns baked into this skeleton

- **Workspace isolation at the query layer, not just the route layer.**
  `middleware/workspaceScope.middleware.js` exports a Mongoose plugin
  (`requireWorkspaceScope`) applied to every tenant-scoped model. Any
  find/update/delete without a `workspaceId` filter throws immediately.
  Legitimate cross-workspace system queries (e.g. the message queue drain)
  must opt out explicitly via `.setOptions({ skipWorkspaceGuard: true })`.

- **Messages are queued, never sent inline.** A transaction POST writes a
  `MessageJob` (see `models/messageJob.model.js`) instead of calling Twilio
  directly. `services/messageQueue.service.js` drains pending jobs on a
  30-second cron tick, with retry counts and a `Notification` audit log.

- **Scheduler locking.** `services/scheduler.service.js` uses a
  `SchedulerLock` document with a unique `{jobName, runDate}` index so the
  end-of-day summary cron can't double-fire if Railway ever runs more than
  one instance.

- **Templated messages, no LLM.** `services/messageBuilder.service.js` is
  deliberately deterministic string templates — AI-generated messaging is a
  parked v2 idea, not part of v1.

- **Zod validation** runs at the route boundary
  (`middleware/validate.middleware.js` + `validators/*.schema.js`) before
  anything touches a controller.

## Not yet wired up (stubs to fill in)

- `notifications`, `summary`, `customers` routes — follow the
  `transactions` route/controller pair as the template.
- PDF generation (pdfkit or Puppeteer) for invoices.
- Razorpay subscription + webhook handlers, including event-ID idempotency
  storage before processing.
- EOD summary job body in `scheduler.service.js` (currently just acquires
  the lock and logs).
