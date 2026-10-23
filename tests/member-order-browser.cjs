/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 회원 로그인·주문 화면이 FastAPI 와 이어지는지 확인한다 (#193).
 * Next.js(BACKEND_URL 로 FastAPI 를 가리킨 빌드)와 FastAPI(backend/)를 같은 전용 DB 로 띄운 뒤 실행한다.
 *
 *   FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/member-order-browser.cjs
 */
const { chromium } = require("./playwright.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3337";
const shots = process.env.FRONT5_SCREENSHOT_DIR || path.join(__dirname, "../docs/screenshots/member-order");
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const shot = (name) => page.screenshot({ path: path.join(shots, name + ".jpg"), type: "jpeg", quality: 80 });
    const email = `member-${Date.now()}@example.com`;

    console.log("FastAPI is reachable through the Next.js /backend proxy");
    assert.equal((await page.request.get(base + "/backend/health")).status(), 200);

    console.log("Sign up with FastAPI and land logged in");
    await page.goto(base + "/login?next=/checkout");
    await page.getByRole("button", { name: "이메일로 회원가입" }).click();
    await page.getByLabel("이름").fill("김종복");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill("abcdefgh"); // 8자는 되지만 숫자가 없다 (브라우저 검사는 통과)
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await page
      .getByRole("alert")
      .getByText(/영문과 숫자/)
      .waitFor();
    await shot("signup-password-rule");
    await page.getByLabel("비밀번호").fill("salad1234");
    await page.getByLabel("연락처 (선택)").fill("010-1234-5678");
    await page.getByRole("button", { name: "회원가입", exact: true }).click();

    console.log("A member orders without payment");
    const cart = [
      { id: 0, dressing: -1, drinks: [], qty: 2, optionSelections: { dressing: ["dressing-1"], drinks: [] } },
    ];
    await page.waitForURL(base + "/checkout"); // /login?next=/checkout 도 맞으므로 정확한 주소로 기다린다
    await page.evaluate((items) => localStorage.setItem("bb-cart", JSON.stringify(items)), cart);
    await page.reload();
    await page.getByText("회원 주문은 결제 없이 바로 접수돼요.").waitFor();
    assert.equal(await page.getByText("토스페이먼츠로 결제").count(), 0);
    await page.getByPlaceholder("배달 주소를 입력해주세요").fill("서울 중구 세종대로 110");
    await page.getByLabel("받는 분").fill("김종복");
    await page.getByLabel("연락처").fill("010-1234-5678");
    await page.locator(".checkout-agree input").check();
    await shot("checkout-member");
    await page.locator(".checkout-pay-btn", { hasText: "주문하기" }).click();
    await page.getByRole("heading", { name: "주문이 접수되었어요" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-cart") || "[]").length), 0);
    await shot("checkout-member-placed");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("checkout-member-placed-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });

    console.log("The member sees and cancels the order in My page");
    await page.getByRole("link", { name: "주문 내역 보기" }).click();
    await page.getByRole("tab", { name: "주문 내역" }).click();
    const order = page.locator(".order-item").first();
    await order.getByText("접수").waitFor();
    await order.getByText(/레몬 치킨 아보카도/).waitFor();
    await shot("mypage-member-orders");
    await order.getByRole("button", { name: "주문 취소" }).click();
    await order.getByText("취소", { exact: true }).waitFor();
    assert.equal(await order.getByRole("button", { name: "주문 취소" }).count(), 0);
    await shot("mypage-member-order-canceled");

    console.log("Logout revokes the token, and a wrong password shows the server message");
    await page.getByRole("tab", { name: "기본 정보" }).click();
    await page.getByRole("button", { name: "로그아웃" }).click();
    await page.waitForURL(base + "/");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("lb-member-token")), null);
    await page.goto(base + "/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill("wrong1234");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.getByRole("alert").getByText("이메일 또는 비밀번호가 올바르지 않습니다.").waitFor();
    await shot("login-wrong-password");

    assert.deepEqual(errors, []);
    console.log("OK");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
