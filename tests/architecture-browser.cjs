/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3397";
const shots = path.join(__dirname, "../docs/screenshots/issue-97");
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const snapshot = await (await context.request.get(base + "/api/catalog")).json();
    snapshot.revision += 100;
    snapshot.defaults.updatedAt = new Date().toISOString();
    snapshot.defaults.pricingPolicy.deliveryFee = 700;
    snapshot.defaults.pricingPolicy.freeDeliveryFrom = 99999;
    delete snapshot.defaults.nutrition["0"];
    snapshot.defaults.catalogConfig.allergenOptions = ["DB 선택지 검증"];
    snapshot.defaults.catalogConfig.originCountries = ["DB 원산지 검증"];
    await page.route("**/api/catalog", (route) => route.fulfill({ json: snapshot }));
    await page.goto(base + "/product/0");
    await page.locator(".pv-meta dd").filter({ hasText: "영양 정보 준비 중" }).waitFor();
    await page.getByText(/예약 배달 700원 \(99,999원 이상 무료\)/).waitFor();
    await page.screenshot({
      path: path.join(shots, "db-policy-and-unknown-nutrition.png"),
    });
    await page.goto(base + "/menu");
    await page.getByText("영양 정보 준비 중", { exact: true }).waitFor();
    const login = await context.request.post(base + "/api/v1/auth/login", {
      data: {
        loginId: process.env.FRONT5_ADMIN_LOGIN_ID || "quality-admin",
        password: process.env.FRONT5_ADMIN_PASSWORD || "quality-password",
      },
    });
    assert.equal(login.status(), 200, await login.text());
    await page.route("**/api/admin/catalog", (route) => route.fulfill({ json: snapshot }));
    await page.goto(base + "/admin");
    await page.getByRole("button", { name: /원산지.*알레르기/ }).click();
    await page.getByRole("button", { name: "수정", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "DB 선택지 검증", exact: true }).waitFor();
    assert.equal(await dialog.locator("#origin-countries option").first().getAttribute("value"), "DB 원산지 검증");
    await dialog.evaluate(async (element) => {
      await Promise.all(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: path.join(shots, "db-editor-options.png") });
    const preview = await context.request.get(base + "/admin/preview", {
      maxRedirects: 0,
    });
    assert.equal(preview.status(), 307);
    assert.equal(preview.headers().location, "/");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "Browser passed: DB policy display, unknown nutrition, DB editor options, authenticated preview redirect; no page errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
