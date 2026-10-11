/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3419";
const shots = process.env.POSTGRES_SCREENSHOT_DIR || path.join(__dirname, "../docs/screenshots/postgres");
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const args = ["--no-sandbox"];
  if (process.env.FRONT5_HOST_RESOLVER) {
    args.push("--host-resolver-rules=" + process.env.FRONT5_HOST_RESOLVER);
  }
  const browser = await chromium.launch({ headless: true, args });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/menu");
    await page.evaluate(() => {
      localStorage.setItem(
        "bb-cart",
        JSON.stringify([
          { id: 0, dressing: -1, drinks: [], qty: 2, optionSelections: { dressing: ["dressing-0"], drinks: [] } },
        ]),
      );
      localStorage.setItem(
        "bb-user",
        JSON.stringify({
          loggedIn: true,
          name: "DB 테스트",
          email: "db-test@example.test",
          phone: "010-1234-5678",
          addresses: [],
          preferredCategories: [],
          excludedAllergens: [],
        }),
      );
    });
    const day = new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
    const query = new URLSearchParams({ address: "서울 중구 DB 검증 주소", day, time: "10:00–11:00" });
    await page.goto(base + "/checkout?" + query);
    await page.getByLabel("받는 분", { exact: true }).fill("DB 테스트");
    await page.getByLabel("연락처", { exact: true }).fill("010-1234-5678");
    await page.getByRole("radio", { name: "신용·체크카드" }).click();
    await page.getByPlaceholder("0000 0000 0000 0000").fill("4111111111111111");
    await page.getByPlaceholder("MM/YY").fill("1230");
    await page.getByPlaceholder("000", { exact: true }).fill("123");
    let attempts = 0;
    const keys = [];
    await page.route("**/api/v1/orders", async (route) => {
      if (route.request().method() !== "POST") {
        return route.continue();
      }
      keys.push(route.request().headers()["idempotency-key"]);
      const request = route.request().postDataJSON();
      assert.deepEqual(Object.keys(request).sort(), [
        "address",
        "desiredEndAt",
        "desiredStartAt",
        "items",
        "ordererName",
        "phone",
      ]);
      const response = await route.fetch();
      if (attempts++ === 0) {
        assert.equal(response.status(), 201);
        // The DB commit succeeds, but the browser loses the response.
        return route.abort("failed");
      }
      assert.equal(response.status(), 200);
      return route.fulfill({ response });
    });
    await page.locator(".checkout-pay-btn").click();
    await page
      .getByRole("alert")
      .getByText(/연결이 끊어졌습니다/)
      .waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 1);
    assert.equal((await (await page.request.get(base + "/api/v1/orders")).json()).items.length, 1);
    await page.screenshot({ path: path.join(shots, "checkout-retry.png"), type: "png" });
    await page.reload();
    await page.getByLabel("받는 분", { exact: true }).fill("DB 테스트");
    await page.getByLabel("연락처", { exact: true }).fill("010-1234-5678");
    await page.locator(".checkout-pay-btn").click();
    await page.getByRole("heading", { name: "주문이 접수되었어요" }).waitFor();
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 0);
    const orders = await (await page.request.get(base + "/api/v1/orders")).json();
    assert.equal(orders.items.length, 1);
    assert.equal(orders.items[0].status, "received");
    await page.screenshot({ path: path.join(shots, "checkout-persisted.png"), type: "png" });
    await page.goto(base + "/mypage");
    await page.getByRole("tab", { name: "주문 내역", exact: true }).click();
    await page.getByText("서울 중구 DB 검증 주소", { exact: true }).waitFor();
    await page.getByText("접수", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(shots, "orders-from-postgres.png"), type: "png" });
    assert.deepEqual(errors, []);
    // Temporary test state is private and used to verify the same cookie after app restart.
    if (process.env.POSTGRES_BROWSER_STATE) {
      fs.writeFileSync(
        process.env.POSTGRES_BROWSER_STATE,
        JSON.stringify({ cookies: await context.cookies(), orderId: orders.items[0].id }),
        { mode: 0o600 },
      );
    }
    console.log("Browser checkout, response-loss retry, refresh, and DB order list passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
