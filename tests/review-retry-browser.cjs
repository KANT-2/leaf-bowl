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
    const ids = [];
    await page.route("**/api/reviews", async (route) => {
      ids.push(route.request().postDataJSON().id);
      const response = await route.fetch();
      if (ids.length === 1) await route.abort("failed");
      else await route.fulfill({ response });
    });
    await page.goto(base + "/product/0/reviews");
    await page.getByRole("button", { name: "리뷰 쓰기", exact: true }).click();
    const dialog=page.locator("dialog.rw");
    await dialog.getByRole("radio", { name: "5점", exact: true }).check();
    await dialog.locator('input[name="title"]').fill("응답 유실 재시도 검증");
    await dialog.locator('textarea[name="text"]').fill("서버 저장 이후 응답을 잃어도 같은 ID로 재시도합니다.");
    await dialog.getByRole("button", { name: "리뷰 등록하기", exact: true }).click();
    await dialog.getByText("리뷰를 저장하지 못했습니다. 다시 시도해주세요.", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "리뷰 등록하기", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
    const snapshot=await (await page.request.get(base+"/api/catalog")).json();
    assert.equal(snapshot.catalog.reviews.filter(r=>r.id===ids[0]).length,1);
    assert.deepEqual(errors, []);
    console.log("Browser scenario passed; no page errors.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
