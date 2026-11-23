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
| `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS` | Session lifetime and password hash cost. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxy hops. Defaults to `0` for direct access. |
| `CORS_ORIGINS` | Comma-separated frontend origins. Development defaults to `http://localhost:5173`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` | Credentials and sender addresses for queued messages. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Billing credentials and callback signing secret. |
| `LINK_TOKEN_SECRET`, `LINK_TOKEN_TTL_HOURS` | Reserved signing setting and receipt lifetime. Current receipt tokens are random and stored in MongoDB. The default lifetime is 48 hours. |

Set `TRUST_PROXY_HOPS=1` on a deployment with exactly one trusted reverse proxy in front of Express. The proxy must overwrite or append the real peer address in `X-Forwarded-For`, and clients must reach Express through that proxy. Match the value to the actual network path before enabling it.

Per IP, login allows 30 unsuccessful requests per 15 minutes. Successful logins release their slot once the response finishes. Signup has its own budget of 10 requests per 15 minutes. Counters are stored per process.

## Stock, customer balances, and reports

Tracked sales, voids, and payments use MongoDB transactions on a replica set or sharded cluster. Standalone MongoDB uses per-process ordered writes and compensation. Use a replica set for production because a standalone process crash can interrupt compensation.

Phase 1 tracks stock and credit effects as they are posted. Earlier sales have no reliable stock movement or credit entry to reverse, so voiding them updates their status without guessing an inventory or balance adjustment. A void after a payment can leave a credit on the customer account. Tracked inventory with active sales cannot be removed because those sales may need stock restored.

Use `GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day` with a bearer token. The date range is inclusive in Asia/Kolkata and is limited to 366 days. Grouping also supports `item` and `paymentMode`. Add `format=csv` to download grouped rows and a total row.

The test suite starts its own in-memory MongoDB and HTTP server. Its first run may download a MongoDB binary. It uses a replica set by default. Set `FUELO_TEST_STANDALONE=1` to exercise compensation against standalone MongoDB. It leaves the scheduler off and uses no live provider credentials.
