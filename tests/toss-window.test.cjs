/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { openTossPayment } = require("../features/checkout/toss.ts");

function fixture() {
  const events = {};
  const calls = [];
  let destroyed = 0;
  let rendered;
  const ready = new Promise((resolve) => (rendered = resolve));
  const controller = new AbortController();
  const request = {
    orderId: "safe-order-uuid",
    orderName: "샐러드 2개",
    amount: 24800,
    customerName: "테스트",
    successUrl: "https://example.com/checkout/success",
    failUrl: "https://example.com/checkout/fail",
  };
  const widgets = {
    async setAmount(value) {
      calls.push(["amount", value]);
    },
    async renderPaymentWindow(value) {
      calls.push(["window", value]);
      return {
        on(event, callback) {
          events[event] = callback;
          if (event === "paymentRequest") {
            rendered();
          }
        },
        async destroy() {
          destroyed++;
        },
      };
    },
    async requestPayment(value) {
      calls.push(["request", value]);
    },
  };
  const toss = {
    widgets(params) {
      calls.push(["init", params]);
      return widgets;
    },
    payment(params) {
      calls.push(["legacy-init", params]);
      return {
        async requestPayment(value) {
          calls.push(["legacy-request", value]);
        },
      };
    },
  };
  const start = (standard = true, method = "card") =>
    openTossPayment({ toss, standard, anonymous: "@@ANONYMOUS", method, request, signal: controller.signal });
  return { events, calls, controller, request, widgets, ready, start, destroyed: () => destroyed };
}

test("standard keys use the anonymous window and server quoted amount; duplicate payment clicks request once", async () => {
  for (const code of ["CARD", "TOSSPAY", "KAKAOPAY"]) {
    const f = fixture();
    const result = f.start();
    await f.ready;
    assert.deepEqual(f.calls, [
      ["init", { customerKey: "@@ANONYMOUS" }],
      ["amount", { currency: "KRW", value: 24800 }],
      ["window", { orderName: f.request.orderName }],
    ]);
    await Promise.all([
      f.events.paymentRequest({ paymentMethod: { code } }),
      f.events.paymentRequest({ paymentMethod: { code } }),
    ]);
    await result;
    assert.equal(f.calls.filter(([name]) => name === "request").length, 1);
    const details = { ...f.request };
    delete details.amount;
    assert.deepEqual(f.calls.at(-1), ["request", details]);
    assert.equal(f.destroyed(), 1);
  }
});

test("deferred, custom, foreign and unsupported methods stop before provider authentication", async () => {
  for (const code of ["VIRTUAL_ACCOUNT", "TRANSFER", "MOBILE_PHONE", "BRANDPAY", "PAYPAL", "NAVERPAY", "CUSTOM-1"]) {
    const f = fixture();
    const result = f.start();
    const rejection = assert.rejects(result, /카드·토스페이·카카오페이/);
    await f.ready;
    await f.events.paymentRequest({ paymentMethod: { code } });
    await rejection;
    assert.equal(
      f.calls.some(([name]) => name === "request"),
      false,
    );
    assert.equal(f.destroyed(), 1);
  }
});

test("window cancellation closes the SDK window and lets checkout retry", async () => {
  const f = fixture();
  const result = f.start();
  const rejection = assert.rejects(result, (error) => error.code === "USER_CANCEL");
  await f.ready;
  await f.events.cancel();
  await rejection;
  assert.equal(f.destroyed(), 1);
  assert.equal(
    f.calls.some(([name]) => name === "request"),
    false,
  );
});

test("page navigation and SDK request failures destroy the window without leaking an event rejection", async () => {
  const f = fixture();
  const result = f.start();
  const rejection = assert.rejects(result, /닫았습니다/);
  await f.ready;
  f.controller.abort();
  await rejection;
  await f.events.paymentRequest({ paymentMethod: { code: "CARD" } });
  assert.equal(f.destroyed(), 1);
  assert.equal(
    f.calls.some(([name]) => name === "request"),
    false,
  );

  const failed = fixture();
  failed.widgets.requestPayment = async () => {
    throw Error("SDK failed");
  };
  const failure = assert.rejects(failed.start(), /SDK failed/);
  await failed.ready;
  await failed.events.paymentRequest({ paymentMethod: { code: "CARD" } });
  await failure;
  assert.equal(failed.destroyed(), 1);
});

test("individual keys keep the existing card and direct easy-pay requests", async () => {
  for (const method of ["card", "toss", "kakaopay"]) {
    const f = fixture();
    await f.start(false, method);
    assert.equal(f.calls[0][0], "legacy-init");
    const request = f.calls[1][1];
    assert.equal(request.method, "CARD");
    assert.deepEqual(request.amount, { currency: "KRW", value: 24800 });
    assert.deepEqual(
      request.card,
      method === "card"
        ? { flowMode: "DEFAULT" }
        : { flowMode: "DIRECT", easyPay: method === "toss" ? "토스페이" : "카카오페이" },
    );
  }
});
