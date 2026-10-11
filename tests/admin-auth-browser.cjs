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
    await page.goto(base + "/admin/login");
    await shot("admin-login");
    await page.getByLabel("아이디", { exact: true }).fill("quality-admin");
    await page.getByLabel("비밀번호", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.getByRole("alert").getByText(/아이디 또는 비밀번호/).waitFor();
    await page.getByLabel("비밀번호", { exact: true }).fill("quality-password");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(/\/admin(?:\?|#|$)/);
    assert.deepEqual(errors, []);
    console.log("Browser scenario passed; no page errors.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
