/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3419";
const shots = process.env.TOSS_SCREENSHOT_DIR || path.join(__dirname, "../docs/screenshots/toss");
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (process.env.FRONT5_APP_ORIGIN) {
      // An internal runner address still uses the configured external origin for CSRF.
      await page.route("**/api/v1/**", async (route) => {
        const response = await route.fetch({
          headers: {
            ...(await route.request().allHeaders()),
            origin: process.env.FRONT5_APP_ORIGIN,
            "sec-fetch-site": "same-origin",
          },
        });
        await route.fulfill({ response });
      });
    }
    await page.goto(base + "/menu");
    await page.evaluate(() => {
      localStorage.setItem(
        "bb-cart",
        JSON.stringify([
          { id: 0, dressing: -1, drinks: [], qty: 2, optionSelections: { dressing: ["dressing-0"], drinks: [] } },
        ]),
      );
    });
    const day = new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
    const query = new URLSearchParams({ address: "서울 중구 결제 검증 주소", day, time: "10:00–11:00" });
    const initialOrders = (await (await page.request.get(base + "/api/v1/orders")).json()).items || [];
    await page.goto(base + "/checkout?" + query);
    await page.getByLabel("받는 분", { exact: true }).fill("결제 테스트");
    await page.getByLabel("연락처", { exact: true }).fill("010-1234-5678");
    const standard = (await page.getByRole("radio", { name: "신용·체크카드" }).count()) === 0;
    if (!standard) {
      await page.getByRole("radio", { name: "신용·체크카드" }).click();
    }
    assert.equal(await page.getByPlaceholder("0000 0000 0000 0000").count(), 0);
    await page.screenshot({ path: path.join(shots, "checkout.png") });
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/payments/checkout") && r.request().method() === "POST",
    );
    await page.locator(".checkout-pay-btn").click();
    const preparedResponse = await response;
    assert.equal(preparedResponse.status(), 200);
    const draft = await preparedResponse.json();
    const submitted = preparedResponse.request().postDataJSON();
    assert.deepEqual(Object.keys(submitted).sort(), [
      "address",
      "desiredEndAt",
      "desiredStartAt",
      "items",
      "ordererName",
      "phone",
    ]);
    const key = preparedResponse.request().headers()["idempotency-key"];
    const provider = page.frameLocator(
      standard
        ? 'iframe[src*="payment-widget.tosspayments.com"]'
        : 'iframe[src*="payment-gateway-sandbox.tosspayments.com"]',
    );
    if (standard) {
      await provider.getByText("테스트 환경이에요. 실제로 결제되지 않아요.", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(shots, "toss-payment-window.png") });
      await provider.getByText("신용·체크카드", { exact: true }).click();
      await provider.getByText("국민", { exact: true }).click();
      await provider.getByRole("button", { name: "결제하기", exact: true }).click();
      await page
        .frameLocator('iframe[src*="payment-gateway-sandbox.tosspayments.com"]')
        .getByRole("button", { name: "인증 취소", exact: true })
        .waitFor();
    } else {
      await provider.getByText("결제 방법을 선택해주세요", { exact: true }).waitFor();
    }
    const providerFrame = page
      .frames()
      .find((f) => new URL(f.url()).hostname === "payment-gateway-sandbox.tosspayments.com");
    assert.ok(providerFrame, "Must open the actual sandbox, never a live payment gateway");
    await page.screenshot({ path: path.join(shots, "toss-card-window.png") });
    if (standard) {
      await page
        .frameLocator('iframe[src*="payment-gateway-sandbox.tosspayments.com"]')
        .getByRole("button", { name: "인증 취소", exact: true })
        .click();
    } else {
      await provider.getByRole("button", { name: "결제 취소", exact: true }).click();
    }
    await page
      .getByRole("alert")
      .getByText(/결제를 중단했어요/)
      .waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 1);
    assert.equal((await (await page.request.get(base + "/api/v1/orders")).json()).items.length, initialOrders.length);
    await page.screenshot({ path: path.join(shots, "cancel-keeps-cart.png") });
    // Cancelled authentication reopens the identical DB draft without creating an order.
    const retryResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/payments/checkout") && r.request().method() === "POST",
    );
    await page.locator(".checkout-pay-btn").click();
    const retry = await retryResponse;
    assert.equal(retry.request().headers()["idempotency-key"], key);
    assert.equal((await retry.json()).orderId, draft.orderId);
    if (standard) {
      await provider.getByRole("button", { name: "닫기", exact: true }).first().click();
    } else {
      await provider.getByRole("button", { name: "결제 취소", exact: true }).click();
    }
    await page
      .getByRole("alert")
      .getByText(/결제를 중단했어요/)
      .waitFor();

    if (standard) {
      // Merchant UI may show other methods; they must stop before authentication.
      const thirdResponse = page.waitForResponse(
        (r) => r.url().endsWith("/api/v1/payments/checkout") && r.request().method() === "POST",
      );
      await page.locator(".checkout-pay-btn").click();
      assert.equal((await (await thirdResponse).json()).orderId, draft.orderId);
      await provider.getByRole("button", { name: /^퀵계좌이체 결제 수단/ }).click();
      await provider.getByRole("button", { name: "결제하기", exact: true }).click();
      await page
        .getByRole("alert")
        .getByText(/카드·토스페이·카카오페이를 선택/)
        .waitFor();
      assert.equal(
        page.frames().some((f) => new URL(f.url()).hostname === "payment-gateway-sandbox.tosspayments.com"),
        false,
      );
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 1);
    }

    // Full authentication requires the tester's own card. This part tests only
    // callback UI with an explicitly mocked approval API. Server approval/recovery
    // is separately exercised by the PostgreSQL integration suite.
    let calls = 0;
    let approve = false;
    const orderId = randomUUID();
    const confirmation = { orderId: draft.orderId, amount: draft.amount, paymentKey: "browser_ui_test_key" };
    const callback =
      base + "/checkout/success?" + new URLSearchParams(Object.entries(confirmation).map(([k, v]) => [k, String(v)]));
    await page.route("**/api/v1/payments/confirm", async (route) => {
      assert.deepEqual(route.request().postDataJSON(), confirmation);
      calls++;
      if (!approve) {
        return route.abort("failed");
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: orderId, total: String(draft.amount) }),
      });
    });
    await page.goto(callback);
    await page
      .getByRole("alert")
      .getByText(/연결이 끊어졌습니다/)
      .waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 1);
    approve = true;
    await page.getByRole("button", { name: "승인 결과 다시 확인" }).click();
    await page.getByRole("heading", { name: "주문이 접수되었어요" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("lb-pending-order")), null);
    await page.screenshot({ path: path.join(shots, "callback-ui-mocked-approval.png") });
    await page.evaluate(() => {
      localStorage.setItem("bb-cart", JSON.stringify([{ id: 1, dressing: -1, drinks: [], qty: 1 }]));
      sessionStorage.setItem("lb-pending-order", "new-order-retry-key");
    });
    await page.reload();
    await page.getByRole("heading", { name: "주문이 접수되었어요" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart"))[0].id), 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("lb-pending-order")), "new-order-retry-key");
    const priorCalls = calls;
    await page.goto(base + "/checkout/success?orderId=bad&amount=1&paymentKey=bad");
    await page
      .getByRole("alert")
      .getByText(/결제 정보가 올바르지 않습니다/)
      .waitFor();
    assert.equal(calls, priorCalls);
    await page.goto(base + "/checkout/fail?message=%3Cscript%3E");
    await page.getByRole("heading", { name: "결제를 완료하지 못했어요" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(shots, "failure-mobile.png") });
    assert.deepEqual(errors, []);
    assert.equal((await (await page.request.get(base + "/api/v1/orders")).json()).items.length, initialOrders.length);
    console.log("Actual Toss sandbox opening/cancellation and draft retries passed; no paid order was created.");
    console.log(
      "Mocked callback UI: response loss, approval retry, cart clearing, old callback protection and invalid/failure pages passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
