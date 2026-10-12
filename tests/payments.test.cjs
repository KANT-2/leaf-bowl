/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { tossTestConfig, createTossGateway } = require("../infrastructure/payments/toss.ts");
const { assertApprovedPayment } = require("../modules/payments/service.ts");
const { confirmPaymentSchema } = require("../modules/payments/schema.ts");

test("missing, mixed and live keys never enable payments", () => {
  for (const env of [
    {},
    { TOSS_CLIENT_KEY: "test_ck_client" },
    { TOSS_CLIENT_KEY: "live_ck_client", TOSS_SECRET_KEY: "live_sk_secret" },
    { TOSS_CLIENT_KEY: "test_ck_client", TOSS_SECRET_KEY: "live_sk_secret" },
    { TOSS_CLIENT_KEY: "test_gck_client", TOSS_SECRET_KEY: "test_sk_secret" },
    { TOSS_CLIENT_KEY: "test_ck_client", TOSS_SECRET_KEY: "test_gsk_secret" },
    { TOSS_CLIENT_KEY: "live_gck_client", TOSS_SECRET_KEY: "live_gsk_secret" },
  ]) {
    assert.throws(
      () => tossTestConfig(env),
      (error) => error.status === 503,
    );
  }
  assert.deepEqual(tossTestConfig({ TOSS_CLIENT_KEY: "test_ck_client", TOSS_SECRET_KEY: "test_sk_secret" }), {
    clientKey: "test_ck_client",
    secretKey: "test_sk_secret",
  });
});

test("standard test gck/gsk keys are accepted as a matched family", () => {
  assert.deepEqual(tossTestConfig({ TOSS_CLIENT_KEY: "test_gck_client", TOSS_SECRET_KEY: "test_gsk_secret" }), {
    clientKey: "test_gck_client",
    secretKey: "test_gsk_secret",
  });
});

test("the approval requires the exact key, order, amount, currency and a completed immediate payment", () => {
  const checkout = { id: randomUUID(), paymentKey: "payment_key", amount: 24800n };
  const approved = {
    orderId: checkout.id,
    paymentKey: checkout.paymentKey,
    totalAmount: 24800,
    currency: "KRW",
    status: "DONE",
    method: "카드",
    approvedAt: "2026-10-11T03:00:00Z",
  };
  assert.doesNotThrow(() => assertApprovedPayment(checkout, approved));
  for (const overrides of [
    { paymentKey: "other" },
    { orderId: randomUUID() },
    { totalAmount: 1 },
    { currency: "USD" },
    { status: "WAITING_FOR_DEPOSIT" },
    { status: "CANCELED" },
    { status: "PARTIAL_CANCELED" },
    { method: "가상계좌" },
    { approvedAt: null },
    { approvedAt: "bad" },
  ]) {
    assert.throws(
      () => assertApprovedPayment(checkout, { ...approved, ...overrides }),
      (error) => error.status === 409,
    );
  }
});

test("callback validation rejects missing, unsafe and extra client payment fields", () => {
  const input = { orderId: randomUUID(), paymentKey: "tgen_key", amount: 24800 };
  assert.ok(confirmPaymentSchema.safeParse(input).success);
  for (const overrides of [
    { amount: "24800" },
    { amount: 0 },
    { amount: 1.1 },
    { amount: NaN },
    { amount: 300000001 },
    { paymentKey: "../../foreign" },
    { orderId: "unknown" },
    { cardNumber: "4111111111111111" },
  ]) {
    assert.equal(confirmPaymentSchema.safeParse({ ...input, ...overrides }).success, false);
  }
});

test("Toss gateway sends server-only Basic authentication and a stable approval idempotency key", async () => {
  const saved = { client: process.env.TOSS_CLIENT_KEY, secret: process.env.TOSS_SECRET_KEY };
  process.env.TOSS_CLIENT_KEY = "test_ck_client";
  process.env.TOSS_SECRET_KEY = "test_sk_secret";
  try {
    const orderId = randomUUID();
    const calls = [];
    const result = {
      orderId,
      paymentKey: "test_payment",
      totalAmount: 24800,
      currency: "KRW",
      status: "DONE",
      method: "카드",
      approvedAt: "2026-10-11T03:00:00Z",
      secret: "must-not-be-forwarded",
    };
    const gateway = createTossGateway(async (url, options) => {
      calls.push({ url, options });
      return Response.json(result);
    });
    const response = await gateway.confirm("test_payment", orderId, 24800);
    await gateway.confirm("test_payment", orderId, 24800);
    assert.equal(calls[0].url, "https://api.tosspayments.com/v1/payments/confirm");
    assert.equal(calls[0].options.headers.Authorization, "Basic " + Buffer.from("test_sk_secret:").toString("base64"));
    assert.equal(calls[0].options.headers["Idempotency-Key"], calls[1].options.headers["Idempotency-Key"]);
    assert.deepEqual(JSON.parse(calls[0].options.body), { orderId, paymentKey: "test_payment", amount: 24800 });
    assert.equal(response.secret, undefined);
    await gateway.lookup(orderId, "test_payment");
    assert.equal(calls[2].url, "https://api.tosspayments.com/v1/payments/test_payment");
    process.env.TOSS_CLIENT_KEY = "test_gck_client";
    process.env.TOSS_SECRET_KEY = "test_gsk_secret";
    await gateway.lookup(orderId, "standard_payment");
    await gateway.confirm("standard_payment", orderId, 24800);
    assert.equal(calls[3].url, "https://api.tosspayments.com/v1/payments/standard_payment");
    assert.equal(calls[3].options.headers.Authorization, "Basic " + Buffer.from("test_gsk_secret:").toString("base64"));
    assert.equal(calls[4].options.headers["Idempotency-Key"], calls[0].options.headers["Idempotency-Key"]);
    const missing = createTossGateway(async () => Response.json({ code: "NOT_FOUND_PAYMENT" }, { status: 404 }));
    assert.equal(await missing.lookup(orderId, "test_payment"), null);
    const failed = createTossGateway(async () =>
      Response.json({ message: "secret merchant information" }, { status: 500 }),
    );
    await assert.rejects(
      failed.confirm("test_payment", orderId, 24800),
      (error) => error.status === 502 && !error.message.includes("merchant"),
    );
    const unavailable = createTossGateway(async () => {
      throw Error("Authorization: secret");
    });
    await assert.rejects(
      unavailable.lookup(orderId, "test_payment"),
      (error) => error.status === 502 && !error.message.includes("secret"),
    );
  } finally {
    if (saved.client === undefined) {
      delete process.env.TOSS_CLIENT_KEY;
    } else {
      process.env.TOSS_CLIENT_KEY = saved.client;
    }
    if (saved.secret === undefined) {
      delete process.env.TOSS_SECRET_KEY;
    } else {
      process.env.TOSS_SECRET_KEY = saved.secret;
    }
  }
});
