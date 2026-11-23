# PostgreSQL migration plan

## Step 0 finding

An untracked cash sale with amount 1,000,000,000,000 and quantity 1.2345 returned HTTP 201. A subsequent detail request returned HTTP 200 with both values unchanged. The current money input cap is `Number.MAX_SAFE_INTEGER / 100`, and the generic sale accepts any finite positive quantity. `NUMERIC(14,2)` tops out at 999,999,999,999.99. `NUMERIC(14,3)` rounds 1.2345 to 1.235. Keeping the exact legacy API and the specified precision and scale therefore requires a decision before the schema work begins.

Customer listing with `search` uses MongoDB text search. The separate autocomplete route uses a case-insensitive, escaped name prefix and caps results at ten. Preserve that route behavior when adding the trigram index. A plain substring search changes the matches for both routes.

## Database touch points

The baseline has 30 model files. The subscription file declares three models, so there are 32 declarations including the legacy Dealer. Direct database references are in 26 controllers, 15 services, three middleware modules, the audit router, the auth validator, both checked-in scripts, eight integration test files and their shared helper. The pure core test also sets the database environment variable. Startup and health wiring are in `src/index.js`, `src/config/db.js`, `src/config/env.js` and `src/app.js`.

Run the following from the repository root to enumerate the direct references by file.

```sh
rg -l 'mongoose|/models/|\.aggregate\(' backend/src backend/scripts backend/tests -g '*.js'
```

The aggregation files are `customers.controller.js` (outstanding), `reports.controller.js` (sales), `pumpReports.controller.js` (stock movements and dip readings) and `dashboard.service.js` (daily sales).

## Proposed tables and constraints

| Area              | Tables and key constraints                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity          | `user_accounts` (unique phone), `workspaces`, `memberships` (unique workspace and user), `refresh_tokens`, `password_otps` (expiry indexes and explicit expiry checks)                                                                                                                                               |
| Sales and credit  | `transactions` (partial unique workspace and invoice number), `customers` (unique workspace and phone, nonnegative credit limit), `ledger_entries` (positive amount and partial unique workspace, transaction and type)                                                                                              |
| Shared operations | `inventory` (unique workspace and item type), `stock_movements`, `price_history`, `links`, `daily_summaries`, `audit_logs`, `message_jobs`, `notifications`, `scheduler_locks` (unique job and run date)                                                                                                             |
| Pump              | `tanks` (unique workspace and name, stock bounds where enforced today), `nozzles` (unique workspace and label), `deliveries`, `dip_readings`, `shifts` (partial unique index for one open shift per workspace)                                                                                                       |
| Timber            | `suppliers`, `purchases` (unique workspace, supplier and invoice number), `supplier_ledger_entries` (positive amount and partial unique workspace, purchase and type), `invoice_counters` (unique workspace, year and kind), `credit_notes` (unique workspace and number). Invoice data is embedded in transactions. |
| Billing           | `subscription_plans` (unique name and billing cycle), `workspace_subscriptions` (unique Razorpay subscription ID), `linked_revenue_accounts`, `webhook_events`                                                                                                                                                       |

The legacy Dealer collection has no target table.

## MongoDB features and SQL replacements

- Replace ObjectIds with UUIDs in the database. Map rows to the established camelCase JSON fields, including `_id`, existing aliases and omission of private fields. Use `timestamptz` for instants and preserve IST day strings.
- Replace schema refs with typed foreign keys and use composite workspace keys for tenant parents. Check write order for rows that reference a transaction before it is inserted. Move writes or use deferred constraints within the same transaction as appropriate.
- Replace defaults, enums and indexes with SQL defaults, CHECK constraints and unique or partial indexes. Keep mixed data and embedded invoice snapshots in JSONB.
- Replace the workspace plugin with mandatory scope at each tenant repository entry point. Evaluate forced RLS using transaction-local workspace context and explicit database roles for cross-tenant scheduler, receipt and webhook lookups.
- Replace Mongoose sessions and compensation with PostgreSQL transactions. Use row locks and conditional updates for concurrency. Increment invoice counters within the transaction. Claim queue jobs with `FOR UPDATE SKIP LOCKED` and use unique daily scheduler locks.
- Replace TTL with indexed expiry columns, checks on reads and periodic deletion. Use escaped prefix semantics for autocomplete and assess text-search parity separately.
- Replace aggregation pipelines with SQL grouping over IST bounds. Convert decimal results into JSON numbers after applying the existing rounding rules and preserve pagination and ordering.
- Replace memory-server integration tests with a migrated PostgreSQL schema per file. Port the legacy auth test after deciding how to preserve its workspace-selection assertions when its legacy data setup is removed.

## MongoDB baseline

`npm.cmd test` passed 37 tests. A second run with temporary response capture and the precision probe passed 38 tests. The notification list and retry fixture uses a separate passing test with a seeded failed message record. Snapshot files record JSON status, route templates and field types. They omit concrete values, query strings and non-JSON response bodies. The existing suite continues to check concrete values, filters, error responses and other behavior.
