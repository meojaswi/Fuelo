const assert = require("node:assert/strict");
const { test } = require("node:test");
const { request, signup, account, sale } = require("./helpers/api");

test("an untracked cash sale preserves its large amount and four-decimal quantity", async () => {
  const signupResponse = await signup(account("9000000099"));
  assert.equal(signupResponse.status, 201);
  const { token } = signupResponse.data;
  const amount = 1_000_000_000_000;
  const quantity = 1.2345;
  const created = await request("/api/transactions", {
    method: "POST",
    token,
    body: { ...sale, paymentMode: "cash", amount, quantity },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.amount, amount);
  assert.equal(created.data.quantity, quantity);

  const fetched = await request(`/api/transactions/${created.data._id}`, { token });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.data.amount, amount);
  assert.equal(fetched.data.quantity, quantity);
});
