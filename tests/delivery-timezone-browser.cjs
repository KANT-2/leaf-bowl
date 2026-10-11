/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3584";
const shots = path.join(__dirname, "../docs/screenshots/delivery-timezone");
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    for (const timezoneId of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) {
      const context = await browser.newContext({ timezoneId, reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-10-12T15:10:00Z")); // KST 10월 13일 00:10
      await context.addInitScript(() => {
        if (!localStorage.getItem("bb-user")) localStorage.setItem("bb-user", JSON.stringify({ loggedIn: true, name: "시간대 검증", email: "test@example.com", addresses: [], preferredCategories: [], excludedAllergens: [] }));
        if (!localStorage.getItem("bb-cart")) localStorage.setItem("bb-cart", JSON.stringify([{ id: 0, dressing: -1, drinks: [], qty: 2, optionSelections: { dressing: ["dressing-0"], drinks: [] } }]));
        if (!localStorage.getItem("bb-orders")) localStorage.setItem("bb-orders", JSON.stringify([{ id: "legacy-kst-order", createdAt: 1, day: "2026-10-13", timeLabel: "00:00–01:00", address: "서울 중구", total: 23000, items: [] }]));
      });
      await page.goto(base + "/menu");
      await page.getByRole("button", { name: /장바구니 열기/ }).click();
      const cart = page.getByRole("dialog", { name: "장바구니", exact: true });
      await cart.waitFor();
      const date = cart.getByLabel("받을 날짜", { exact: true });
      assert.equal(await date.getAttribute("min"), "2026-10-13");
      assert.equal(await date.getAttribute("max"), "2026-10-27");
      await date.fill("2026-10-13");
      await cart.getByRole("combobox", { name: /^시간대/ }).selectOption("10:00");
      await cart.getByLabel(/^배달 주소/).fill("서울 중구");
      await cart.getByRole("checkbox").check();
      await cart.getByRole("button", { name: "결제하러 가기 →", exact: true }).click();
      await page.waitForURL("**/checkout?**");
      const params = new URL(page.url()).searchParams;
      assert.equal(params.get("desiredStartAt"), "2026-10-13T01:00:00.000Z");
      assert.equal(params.get("desiredEndAt"), "2026-10-13T02:00:00.000Z");
      assert.equal(params.has("day"), false);
      await page.getByText("서울 중구 · 2026-10-13 10:00–11:00", { exact: true }).waitFor();
      if (timezoneId === "UTC") await page.screenshot({ path: path.join(shots, "checkout-kst.jpg"), type: "jpeg", quality: 80 });

      // 같은 UTC 예약을 실제 서버 API에도 보내 저장·조회 계약을 검증한다.
      await context.request.post(base + "/api/v1/session");
      const response = await context.request.post(base + "/api/v1/orders", {
        headers: { "Idempotency-Key": "timezone-" + timezoneId.replaceAll("/", "-") },
        data: { items: [{ productId: 0, dressingKey: "dressing-0", quantity: 2 }], ordererName: "시간대 검증", phone: "010-1234-5678", address: "서울 중구", desiredStartAt: params.get("desiredStartAt"), desiredEndAt: params.get("desiredEndAt") },
      });
      assert.equal(response.status(), 201, await response.text());
      const created = await response.json();
      const detail = await (await context.request.get(base + "/api/v1/orders/" + created.id)).json();
      assert.equal(detail.desiredStartAt, params.get("desiredStartAt"));
      assert.equal(detail.desiredEndAt, params.get("desiredEndAt"));
      assert.equal(detail.desiredDate, "2026-10-13");
      assert.equal(detail.desiredSlot, "10:00–11:00");

      await page.locator(".checkout-pay-btn").click();
      await page.getByRole("heading", { name: "결제가 완료되었어요", exact: true }).waitFor();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bb-orders"))[0]);
      assert.equal(saved.desiredStartAt, params.get("desiredStartAt"));
      assert.equal(saved.desiredEndAt, params.get("desiredEndAt"));
      assert.equal(saved.day, undefined);
      assert.equal(saved.timeLabel, undefined);
      await page.goto(base + "/mypage");
      await page.getByRole("tab", { name: "주문 내역", exact: true }).click();
      await page.getByText("2026.10.13 · 10:00–11:00", { exact: true }).waitFor();
      await page.getByText("2026.10.13 · 00:00–01:00", { exact: true }).waitFor();
      if (timezoneId === "UTC") await page.screenshot({ path: path.join(shots, "orders-kst.jpg"), type: "jpeg", quality: 80 });
      assert.deepEqual(errors, []);
      console.log(timezoneId + ": UTC request/storage, KST checkout/history and legacy history passed; no page errors.");
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
