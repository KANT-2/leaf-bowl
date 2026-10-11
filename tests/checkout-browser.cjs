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
    let snapshot = await (await page.request.get(base + "/api/catalog")).json();
    await page.route("**/api/catalog", (route) => route.fulfill({ json: snapshot }));
    console.log("Checkout revalidates stock even before catalog polling");
    const seedCart = [{ id: 0, dressing: -1, drinks: [], qty: 2, optionSelections: { dressing: ["dressing-0"], drinks: [] } }];
    await page.goto(base + "/menu");
    await page.evaluate((items) => localStorage.setItem("bb-cart", JSON.stringify(items)), seedCart);
    const date = new Date(); date.setDate(date.getDate() + 1);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    await page.goto(base + "/checkout?" + new URLSearchParams({ address: "서울 중구", day, time: "10:00–11:00" }));
    await page.locator(".checkout-pay-btn").waitFor();
    snapshot.catalog.products.find((p) => p.customerId === 0).status = "soldout";
    snapshot.revision++;
    await page.locator(".checkout-pay-btn").click();
    await page.getByRole("alert").getByText(/품절되거나 삭제된/).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-orders") || "[]").length), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart")).length), 1);
    await shot("checkout-stock-changed");
    assert.deepEqual(errors, []);
    console.log("Browser scenario passed; no page errors.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
