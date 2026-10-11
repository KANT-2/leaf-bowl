/* eslint-disable @typescript-eslint/no-require-imports */
// API interception changes test responses only; live administrator data is preserved.
require("./register-typescript.cjs");
const { publicSnapshot } = require("../modules/catalog/public-snapshot.ts");
const { signInAdmin } = require("./browser-helpers.cjs");
const { chromium } = require("./playwright.cjs");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3000";
const assert = require("assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await signInAdmin(context, base);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.request.get(base + "/api/catalog");
  const original = await response.json();
  let snapshot = structuredClone(original);
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: publicSnapshot(snapshot) }),
  );
  console.log("Checking menu");
  await page.route('**/api/reviews', async route=>{
    const body=route.request().postDataJSON();
    if(!snapshot.catalog.reviews.some(r=>r.id===body.id)){
      snapshot.catalog.reviews.unshift({id:body.id,productId:`salad-${body.pid}`,menu:snapshot.catalog.products.find(p=>p.customerId===body.pid)?.name??'',author:body.author,rating:body.stars,title:body.title,body:body.text,date:body.date,createdAt:new Date(body.t).toISOString(),deleted:false});snapshot.revision++;
    }
    await route.fulfill({json:snapshot});
  });
  await context.addInitScript(()=>{localStorage.setItem('bb-user-reviews',JSON.stringify([{id:'browser-legacy-review',pid:0,author:'테스트',stars:5,title:'브라우저 리뷰 이관',text:'기존 브라우저에 저장된 리뷰를 공통 저장소로 이관하는 테스트입니다.',date:'2026.10.08',via:'delivery',t:Date.now()}]));});
  await page.goto(base + "/menu");
  await page
    .getByRole("link", {
      name: original.catalog.products[0].name + " 상세 보기",
      exact: true,
    })
    .waitFor();
  const product = snapshot.catalog.products.find((p) => p.customerId === 0);
  product.name = "연동 브라우저 검증 메뉴";
  product.price = 17700;
  product.status = "active";
  snapshot.revision++;
  await page.evaluate(() => {
    const channel = new BroadcastChannel("catalog-updated");
    channel.postMessage("saved");
    channel.close();
  });
  await page
    .getByRole("link", { name: product.name + " 상세 보기", exact: true })
    .waitFor({ timeout: 12000 });
  assert.ok(await page.getByText("17,700원", { exact: true }).count());
  product.ingredients = "폴링으로 갱신한 구성 재료";
  snapshot.revision++;
  await page
    .getByText(product.ingredients, { exact: true })
    .waitFor({ timeout: 12000 });
  const hidden = snapshot.catalog.products.find((p) => p.customerId === 1);
  hidden.status = "hidden";
  snapshot.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    (name) =>
      !Array.from(document.querySelectorAll(".product h3")).some(
        (el) => el.textContent === name,
      ),
    hidden.name,
    { timeout: 12000 },
  );
  assert.ok(snapshot.catalog.reviews.some(r=>r.id==='browser-legacy-review'));
  await page.screenshot({
    path: "/tmp/front5-catalog-menu.png",
    fullPage: false,
  });
  console.log("Checking product and cart");
  await page.goto(base + "/product/0");
  await page
    .getByRole("heading", { name: product.name, exact: true })
    .waitFor();
  await page.getByRole("radio", { name: /레몬 올리브/ }).check();
  await page.getByRole("checkbox", { name: /아이스 아메리카노/ }).check();
  await page.getByRole("button", { name: /· 담기/ }).click();
  await page
    .getByRole("dialog", { name: "장바구니", exact: true })
    .getByText(product.name, { exact: true })
    .waitFor();
  await page
    .getByRole("dialog", { name: "장바구니", exact: true })
    .getByText(product.name, { exact: true })
    .waitFor();
  const drink = snapshot.catalog.products.find((p) => p.id === "drink-0");
  const cart = page.getByRole("dialog", { name: "장바구니", exact: true });
  const lemon = snapshot.catalog.products.find((p) => p.type === "dressing" && p.name === "레몬 올리브");
  assert.equal(await cart.getByLabel("드레싱", { exact: true }).inputValue(), lemon.id);
  await cart.getByRole("button", { name: /^오렌지 주스 .* 담기/ }).click();
  const orange = snapshot.catalog.products.find((p) => p.type === "drink" && p.name === "오렌지 주스");
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem("bb-cart")).some((item) => item.kind === "drink" && item.drinkKey === id), orange.id);
  assert.ok(await cart.getByRole("button", { name: /^오렌지 주스 .*지금 1잔/ }).count());
  drink.price = 4500;
  snapshot.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("dialog", { name: "장바구니", exact: true })
    .getByText("22,200원", { exact: true })
    .first()
    .waitFor({ timeout: 12000 });
  await page.screenshot({
    path: "/tmp/front5-catalog-cart.png",
    fullPage: false,
  });
  console.log("Checking ingredients");
  await page.goto(base + "/match");
  const ingredient = snapshot.catalog.ingredients.find(
    (i) => !i.deleted && i.status === "active",
  );
  ingredient.name = "실시간 연동 재료";
  snapshot.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(ingredient.name, { exact: true })
    .first()
    .waitFor({ timeout: 12000 });
  console.log("Checking shared review modal");
  await page.goto(base + "/product/0/reviews");
  await page.getByRole("button", {name:"리뷰 쓰기", exact:true}).click();
  const reviewDialog=page.locator("dialog.rw");
  await reviewDialog.getByRole("radio",{name:"5점",exact:true}).check();
  await reviewDialog.locator('input[name="title"]').fill("공통 리뷰 등록 검증");
  await reviewDialog.locator('textarea[name="text"]').fill("새 리뷰 작성 모달에서도 공통 저장소에 저장되는지 검증합니다.");
  await reviewDialog.getByRole("button",{name:"리뷰 등록하기",exact:true}).click();
  await page.getByRole("heading",{name:"공통 리뷰 등록 검증",exact:true}).waitFor({timeout:12000});
  const posted=snapshot.catalog.reviews.find(r=>r.title==="공통 리뷰 등록 검증");
  assert.ok(posted);
  await page.goto(base + "/reviews");
  await page.getByRole("heading",{name:"공통 리뷰 등록 검증",exact:true}).waitFor({timeout:12000});
  posted.deleted=true;
  snapshot.revision++;
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await page.getByRole("heading",{name:"공통 리뷰 등록 검증",exact:true}).waitFor({state:"hidden",timeout:12000});
  console.log("Checking admin preview");
  await page.goto(base + "/admin");
  await page
    .getByRole("button", { name: "고객 미리보기", exact: true })
    .click();
  await page
    .frameLocator('iframe[title="고객 페이지 미리보기"]')
    .getByRole("heading", { name: /좋은 하루는/ })
    .waitFor();
  await page.screenshot({
    path: "/tmp/front5-catalog-admin-preview.png",
    fullPage: false,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser passed: live name/price update, polling, hidden products, cart option repricing, ingredients, customer preview; no page errors.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
