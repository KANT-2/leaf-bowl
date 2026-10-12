/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { setServicesForTests, createLimits } = require("../application/container.ts");
const { createIdentityService } = require("../modules/identity/service.ts");
const { createMemoryIdentityRepository } = require("../modules/identity/repository.ts");
const prepare = require("../app/api/v1/payments/checkout/route.ts");
const confirm = require("../app/api/v1/payments/confirm/route.ts");
const orders = require("../app/api/v1/orders/route.ts");

test("payment routes require the guest cookie, same origin and validated inputs, and close the unpaid order bypass", async () => {
  const identity = createIdentityService({ repository: createMemoryIdentityRepository([]) });
  const guest = await identity.issueGuestSession();
  let prepared = 0,
    confirmed = 0;
  const payments = {
    async prepare(sessionId) {
      assert.equal(sessionId, guest.session.id);
      prepared++;
      return { orderId: randomUUID(), amount: 24800 };
    },
    async confirm(sessionId, input) {
      assert.equal(sessionId, guest.session.id);
      assert.equal(input.amount, 24800);
      confirmed++;
      return {
        id: randomUUID(),
        status: "received",
        subtotal: 21800n,
        deliveryFee: 3000n,
        total: 24800n,
        createdAt: new Date(),
      };
    },
  };
  setServicesForTests({ identity, payments, limits: createLimits({ order: 100 }), orders: {} });
  const request = (path, body, headers = {}) =>
    new Request("https://app.example" + path, {
      method: "POST",
      headers: {
        cookie: "lb_guest=" + guest.token,
        "content-type": "application/json",
        origin: "https://app.example",
        "idempotency-key": "checkout-test-001",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const body = {
    ordererName: "결제 테스트",
    phone: "010-1234-5678",
    address: "서울 중구",
    desiredStartAt: "2026-10-13T03:00:00.000Z",
    desiredEndAt: "2026-10-13T04:00:00.000Z",
    items: [{ productId: 0, quantity: 2, dressingKeys: ["dressing-0"] }],
  };
  const approval = { orderId: randomUUID(), paymentKey: "test_payment", amount: 24800 };
  for (const route of [prepare, confirm]) {
    assert.equal(
      (await route.POST(request("/api/v1/payments", body, { origin: "https://attacker.example" }))).status,
      403,
    );
    assert.equal((await route.POST(request("/api/v1/payments", body, { cookie: "" }))).status, 401);
  }
  assert.equal(
    (await prepare.POST(request("/api/v1/payments/checkout", { ...body, cardNumber: "4111111111111111" }))).status,
    400,
  );
  assert.equal((await confirm.POST(request("/api/v1/payments/confirm", { ...approval, amount: "24800" }))).status, 400);
  assert.equal((await orders.POST(request("/api/v1/orders", body))).status, 409);
  assert.equal(prepared, 0);
  assert.equal(confirmed, 0);
  const draft = await prepare.POST(request("/api/v1/payments/checkout", body));
  assert.equal(draft.status, 200);
  assert.equal(draft.headers.get("cache-control"), "no-store");
  const result = await confirm.POST(request("/api/v1/payments/confirm", approval));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).total, "24800");
  assert.equal(prepared, 1);
  assert.equal(confirmed, 1);
  setServicesForTests(undefined);
});
