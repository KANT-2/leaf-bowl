/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("./register-typescript.cjs");
const { kstDate } = require("../modules/shared/time.ts");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3337";
const shots = process.env.FRONT5_SCREENSHOT_DIR || path.join(__dirname, "../docs/screenshots/delivery-timezone");
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    for (const timezoneId of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) {
      const context = await browser.newContext({
        timezoneId,
        locale: "ko-KR",
        reducedMotion: "reduce",
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const snapshot = await (await context.request.get(base + "/api/catalog")).json();
      snapshot.revision += 100; // The customer provider only accepts newer catalog revisions.
      const product = snapshot.catalog.products.find((p) => p.customerId === 0);
      snapshot.catalog.reviews = [
        {
          ...snapshot.catalog.reviews[0],
          id: "kst-boundary",
          productId: product.id,
          author: "KST 검증",
          title: "자정 날짜 검증",
          body: "UTC 자정 이전에도 한국에서는 다음 날짜로 표시됩니다.",
          date: "2026.10.12",
          createdAt: "2026-10-12T15:10:00.000Z",
          deleted: false,
        },
      ];
      await page.route("**/api/catalog", (route) => route.fulfill({ json: snapshot }));
      await page.route("**/api/admin/catalog", (route) => route.fulfill({ json: snapshot }));
      await page.clock.setFixedTime(new Date("2026-10-12T15:10:00Z"));
      await page.goto(base + "/product/0");
      await page
        .locator(".review-card")
        .filter({ hasText: "자정 날짜 검증" })
        .getByText(/2026\.10\.13/)
        .waitFor();
      if (timezoneId === "UTC") {
        await page.locator(".pv-reviews").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(shots, "reviews-kst.jpg"), type: "jpeg", quality: 80 });
      }
      await page.goto(base + "/product/0/reviews");
      await page
        .locator(".rv-item")
        .filter({ hasText: "자정 날짜 검증" })
        .getByText("2026.10.13", { exact: true })
        .waitFor();

      // Actual API assigns server time; clients cannot backdate the review.
      const reviewId = "utc-browser-" + require("node:crypto").randomUUID();
      const response = await context.request.post(base + "/api/reviews", {
        data: {
          id: reviewId,
          pid: 0,
          author: "서버 시각 검증",
          stars: 5,
          title: "UTC 시각 검증",
          text: "서버에서 UTC 시각을 저장하고 KST 날짜를 계산합니다.",
          via: "delivery",
          date: "1900.01.01",
          createdAt: "1900-01-01T00:00:00Z",
        },
      });
      assert.equal(response.status(), 200, await response.text());
      const saved = (await response.json()).catalog.reviews.find((r) => r.id === reviewId);
      assert.match(saved.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.equal(saved.date, kstDate(Date.parse(saved.createdAt)).replaceAll("-", "."));
      assert.ok(Math.abs(Date.parse(saved.createdAt) - Date.now()) < 60000);

      const login = await context.request.post(base + "/api/v1/auth/login", {
        data: {
          loginId: process.env.FRONT5_ADMIN_LOGIN_ID || "quality-admin",
          password: process.env.FRONT5_ADMIN_PASSWORD || "quality-password",
        },
      });
      assert.equal(login.status(), 200, await login.text());
      await page.goto(base + "/admin");
      await page.getByRole("button", { name: "고객 리뷰 관리", exact: true }).click();
      await page.locator(".managed-review").getByText("· 2026.10.13 00:10", { exact: true }).waitFor();
      if (timezoneId === "UTC") {
        await page.screenshot({ path: path.join(shots, "admin-reviews-kst.jpg"), type: "jpeg", quality: 80 });
      }
      await page.route("**/api/admin/sales?**", (route) =>
        route.fulfill({
          json: {
            productType: "salad",
            period: "all",
            connected: true,
            updatedAt: "2026-10-12T15:10:00.000Z",
            totalQuantity: 0,
            orderCount: 0,
            rows: [],
            combinations: [],
          },
        }),
      );
      await page.getByRole("button", { name: "제품 판매 현황", exact: true }).click();
      await page.getByText("판매 데이터 갱신: 2026. 10. 13. 오전 12:10", { exact: true }).waitFor();

      // The historical preview route redirects to the DB-backed customer application.
      const preview = await context.request.get(base + "/admin/preview", { maxRedirects: 0 });
      assert.equal(preview.status(), 307);
      assert.equal(preview.headers().location, "/");
      await page.goto(base + "/admin/preview");
      await page.waitForURL(base + "/");
      await page.getByRole("heading", { name: /좋은 하루는/ }).waitFor();
      assert.deepEqual(errors, []);
      console.log(
        timezoneId + ": UTC review API; KST customer/admin/sales/preview dates and slot cutoff passed; no page errors.",
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
