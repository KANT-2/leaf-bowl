/* eslint-disable @typescript-eslint/no-require-imports */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const store = require("../application/reviews.ts");
const { setServicesForTests, createLimits } = require("../application/container.ts");
beforeEach(() => {
  setServicesForTests({
    identity: { resolve: async (token) => (token === "test-guest" ? { id: "own-session" } : null) },
    limits: createLimits(),
  });
  store.verifyReviewPurchase = async () => {};
});
const { AppError } = require("../modules/shared/errors.ts");
const { POST } = require("../app/api/reviews/route.ts");
const request = (body) =>
  new Request("http://localhost:3000/api/reviews", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie: "lb_guest=test-guest" },
    body,
  });
const valid = JSON.stringify({
  id: "review-test",
  pid: 0,
  orderItemId: "1",
  author: "테스트",
  stars: 5,
  title: "리뷰 제목",
  text: "충분히 긴 리뷰 본문입니다.",
  via: "delivery",
});

test("reviews return 400 for malformed JSON and 413 for oversized bodies", async () => {
  const original = store.appendPurchasedReview;
  let called = false;
  store.appendPurchasedReview = async () => {
    called = true;
    throw Error("should not reach storage");
  };
  try {
    const response = await POST(request("{"));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /형식/);
    assert.equal((await POST(request(" "))).status, 400);
    assert.equal((await POST(request("x".repeat(5 * 1024 * 1024 + 1)))).status, 413);
    assert.equal(called, false);
  } finally {
    store.appendPurchasedReview = original;
  }
});

test("reviews distinguish domain errors from logged unexpected failures without leaking details", async () => {
  const original = store.appendPurchasedReview;
  const error = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    store.appendPurchasedReview = async () => {
      throw new AppError(400, "해당 메뉴에 리뷰를 작성할 수 없습니다.");
    };
    assert.equal((await POST(request(valid))).status, 400);
    assert.equal(logs.length, 0);
    store.appendPurchasedReview = async () => {
      throw Error("simulated storage failure");
    };
    const response = await POST(request(valid));
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /simulated storage failure/);
    assert.equal(logs.length, 1);
    assert.match(logs[0][0], /reviews/);
  } finally {
    store.appendPurchasedReview = original;
    console.error = error;
  }
});

test("reviews reject unauthenticated and foreign-origin writes before storage", async () => {
  const noCookie = new Request("http://localhost:3000/api/reviews", { method: "POST", body: valid });
  assert.equal((await POST(noCookie)).status, 401);
  noCookie.headers.set("cookie", "lb_guest=forged");
  assert.equal((await POST(noCookie)).status, 401);
  const foreign = request(valid);
  foreign.headers.set("origin", "https://attacker.example");
  assert.equal((await POST(foreign)).status, 403);
});

test("purchase verification precedes photo writes and review requests are limited", async () => {
  store.verifyReviewPurchase = async () => {
    throw new AppError(404, "주문 품목을 찾을 수 없습니다.");
  };
  const body = { ...JSON.parse(valid), photos: ["data:image/png;base64,AAAA"] };
  assert.equal((await POST(request(JSON.stringify(body)))).status, 404);
  setServicesForTests({
    identity: { resolve: async () => ({ id: "own-session" }) },
    limits: createLimits({ review: 1 }),
  });
  assert.equal((await POST(request(valid))).status, 404);
  assert.equal((await POST(request(valid))).status, 429);
});
