const assert = require("node:assert/strict");
const { once } = require("node:events");
const http = require("node:http");
const { after, before } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer, MongoMemoryReplSet } = require("mongodb-memory-server");

let mongo;
let server;
let baseUrl;
let proxy;
let proxyUrl;
const Dealer = require("../../src/models/dealer.model");
const Link = require("../../src/models/link.model");
const UserAccount = require("../../src/models/userAccount.model");
const hashPassword = (...args) => require("../../src/services/auth.service").hashPassword(...args);

const password = "phase-zero-password";
const account = (phone, verticalType = "fuel") => ({
  businessName: "Phase Zero Station",
  phone,
  password,
  verticalType,
});
const sale = {
  customerName: "Fleet Customer",
  customerPhone: "+919000000099",
  itemType: "Diesel",
  quantity: 10,
  unit: "litres",
  amount: 900,
  paymentMode: "credit",
};

before(async () => {
  mongo =
    process.env.FUELO_TEST_STANDALONE === "1"
      ? await MongoMemoryServer.create()
      : await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.NODE_ENV = "test";
  process.env.TRUST_PROXY_HOPS = "1";
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = "fuelo-integration-test-secret-only";
  process.env.BCRYPT_SALT_ROUNDS = "4";
  process.env.CORS_ORIGINS = "http://localhost:5173";
  process.env.TWILIO_ACCOUNT_SID = "AC00000000000000000000000000000000";
  process.env.TWILIO_AUTH_TOKEN = "test-only-token";
  process.env.TWILIO_WHATSAPP_DUES_REMINDER_CONTENT_SID_HI = "HX" + "1".repeat(32);
  process.env.TWILIO_WHATSAPP_SHIFT_VARIANCE_CONTENT_SID = "HX" + "2".repeat(32);
  process.env.RAZORPAY_KEY_ID = "rzp_test_fuelo";
  process.env.RAZORPAY_KEY_SECRET = "test-only-key";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-only-webhook";

  const app = require("../../src/app");
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Model a reverse proxy appending the observed client IP to the forwarding chain.
  // The test supplies synthetic client addresses so both clients can run on loopback.
  proxy = http.createServer((req, res) => {
    const { "x-test-client-ip": clientIp, ...headers } = req.headers;
    headers["x-forwarded-for"] = [headers["x-forwarded-for"], clientIp].filter(Boolean).join(", ");
    const upstream = http.request(
      new URL(req.url, baseUrl),
      { method: req.method, headers },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      }
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
});

after(async () => {
  if (proxy) await new Promise((resolve) => proxy.close(resolve));
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function request(
  path,
  { method = "GET", body, token, origin, clientIp, forwardedFor, headers: extra } = {}
) {
  const headers = { ...extra };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  if (clientIp) headers["X-Test-Client-IP"] = clientIp;
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  const response = await fetch(`${clientIp ? proxyUrl : baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/pdf")) data = Buffer.from(await response.arrayBuffer());
  else if (contentType.includes("text/csv")) data = await response.text();
  else data = await response.json();
  return { status: response.status, headers: response.headers, data };
}

function signup(body) {
  return request("/api/auth/signup", { method: "POST", body });
}

async function phaseWorkspace(phone) {
  const clientIp = "198.51.100." + Number(phone.slice(-3));
  const response = await request("/api/auth/signup", {
    method: "POST",
    body: account(phone),
    clientIp,
  });
  assert.equal(response.status, 201);
  return response.data;
}

function login(phone, candidate = password) {
  return request("/api/auth/login", { method: "POST", body: { phone, password: candidate } });
}

async function inviteUser(owner, phone, role) {
  const user = await UserAccount.create({ phone, name: role });
  const workspaceId = owner.dealer.workspaceId;
  await require("../../src/models/membership.model").create({
    workspaceId,
    userId: user._id,
    role,
  });
  return require("../../src/controllers/auth.controller").sessionFor(user, workspaceId);
}

module.exports = {
  request,
  signup,
  login,
  phaseWorkspace,
  inviteUser,
  account,
  sale,
  password,
  Dealer,
  Link,
  UserAccount,
  hashPassword,
};
