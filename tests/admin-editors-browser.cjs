/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3337";
const shots = path.join(__dirname, "../docs/screenshots/code-quality");
fs.mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const shot = (name) => page.screenshot({ path: path.join(shots, name + ".jpg"), type: "jpeg", quality: 80 });
    await page.goto(base + "/admin");
    for (const name of ["옵션 관리", "bowl match 관리", "고객 페이지 편집", "고객 리뷰 관리", "위치 및 배달 관리", "원산지 및 알레르기 관리", "휴지통", "메뉴 관리"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.locator("main.workspace h1").waitFor();
    }
    let conflict = true;
    await page.route("**/api/admin/catalog", async (route) => {
      if (route.request().method() === "PUT" && conflict) {
        conflict = false;
        await route.fulfill({ status: 409, json: { error: "다른 관리자가 저장했습니다. 최신 내용을 불러와주세요." } });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "수정", exact: true }).first().click();
    const editor = page.getByRole("dialog", { name: "메뉴 수정", exact: true });
    await editor.getByLabel("메뉴 이름", { exact: true }).fill("코드 품질 검증 메뉴");
    await editor.getByRole("button", { name: "메뉴 저장", exact: true }).click();
    await editor.getByRole("alert").waitFor();
    assert.equal(await editor.getByLabel("메뉴 이름", { exact: true }).inputValue(), "코드 품질 검증 메뉴");
    await editor.getByRole("button", { name: "최신 내용 불러오기", exact: true }).click();
    await editor.getByRole("button", { name: "메뉴 저장", exact: true }).click();
    await editor.waitFor({ state: "hidden" });
    await page.getByRole("row").filter({ hasText: "코드 품질 검증 메뉴" }).first().waitFor();
    await shot("admin-products");
    await page.getByRole("button", { name: "고객 미리보기", exact: true }).click();
    await page.frameLocator('iframe[title="고객 페이지 미리보기"]').getByRole("heading", { name: /좋은 하루는/ }).waitFor();
    await page.keyboard.press("Escape");

    assert.deepEqual(errors, []);
    console.log("Browser scenario passed; no page errors.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
