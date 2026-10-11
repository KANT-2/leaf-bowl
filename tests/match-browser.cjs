/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
require("./register-typescript.cjs");
const { publicSnapshot } = require("../modules/catalog/public-snapshot.ts");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3337";
const shots = process.env.FRONT5_SCREENSHOT_DIR || path.join(__dirname, "../docs/screenshots/code-quality");
fs.mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const shot = (name) => page.screenshot({ path: path.join(shots, name + ".jpg"), type: "jpeg", quality: 80 });
    console.log("Match state across unrelated catalog updates");
    let snapshot = await (await page.request.get(base + "/api/catalog")).json();
    await page.route("**/api/catalog", (route) => route.fulfill({ json: publicSnapshot(snapshot) }));
    await page.goto(base + "/match");
    for (let n = 1; n <= 2; n++) {
      await page.getByRole("button", { name: "재료 추가하기", exact: true }).click();
      await page.waitForFunction((n) => document.querySelectorAll(".ingredient-chip").length === n, n);
    }
    snapshot.catalog.reviews.unshift({ id: "quality-revision-review", productId: "salad-0", author: "검증", rating: 5, title: "새 리뷰", body: "선택 진행 중 들어온 리뷰입니다.", menu: "코드 품질 검증 메뉴", date: "2026.10.10", deleted: false });
    snapshot.revision++;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(700);
    assert.equal(await page.locator(".ingredient-chip").count(), 2);
    await page.getByRole("button", { name: "샐러드 완성", exact: true }).click();
    const result = page.locator("dialog.bm-result");
    await result.getByLabel("내 샐러드 이름", { exact: true }).fill("진행 보존 볼");
    snapshot.revision++;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(700);
    assert.ok(await result.isVisible());
    assert.equal(await result.getByLabel("내 샐러드 이름", { exact: true }).inputValue(), "진행 보존 볼");
    await result.getByRole("button", { name: /내 조합 저장하기/ }).click();
    const selectedDressing = await result.getByLabel("마지막으로, 드레싱").inputValue();
    assert.ok(snapshot.catalog.products.some((product) => product.id === selectedDressing && product.type === "dressing"));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bm-recipe")).dressingKey), selectedDressing);
    await shot("match-result");
    await result.getByRole("button", { name: "장바구니에 담기", exact: true }).click();
    const cart = page.getByRole("dialog", { name: "장바구니", exact: true });
    await cart.waitFor();
    await cart.getByText("진행 보존 볼", { exact: false }).first().waitFor();
    assert.equal(await cart.getByLabel("드레싱", { exact: true }).inputValue(), selectedDressing);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart"))[0].dressingKey), selectedDressing);
    await shot("cart");
    await page.keyboard.press("Escape");
    await page.goto(base + "/menu");
    await page.goto(base + "/match");
    assert.equal(await page.locator(".ingredient-chip").count(), 0);
    await page.getByRole("button", { name: "저장한 조합 불러오기", exact: true }).first().click();
    await result.waitFor();
    assert.equal(await page.locator(".ingredient-chip").count(), 2);

    snapshot.catalog.ingredients.find((ingredient) => ingredient.status === "active" && !ingredient.deleted).status = "hidden";
    snapshot.revision++;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() => document.querySelectorAll(".ingredient-chip").length === 0);
    await result.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    console.log("Browser scenario passed; no page errors.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
