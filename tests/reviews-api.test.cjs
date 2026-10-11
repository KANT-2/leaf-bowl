/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const store = require("../application/catalog.ts");
const { AppError } = require("../modules/shared/errors.ts");
const { POST } = require("../app/api/reviews/route.ts");
const request = body => new Request("http://localhost:3000/api/reviews", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body });
const valid = JSON.stringify({ id: "review-test", pid: 0, author: "테스트", stars: 5, title: "리뷰 제목", text: "충분히 긴 리뷰 본문입니다.", via: "delivery" });

test("reviews return 400 for malformed JSON and 413 for oversized bodies", async () => {
  const original = store.appendCustomerReview;
  let called = false;
  store.appendCustomerReview = async () => { called = true; throw Error("should not reach storage"); };
  try {
    const response = await POST(request("{"));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /형식/);
    assert.equal((await POST(request(" "))).status, 400);
    assert.equal((await POST(request("x".repeat(5 * 1024 * 1024 + 1)))).status, 413);
    assert.equal(called, false);
  } finally { store.appendCustomerReview = original; }
});

test("reviews distinguish domain errors from logged unexpected failures without leaking details", async () => {
  const original = store.appendCustomerReview;
  const error = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    store.appendCustomerReview = async () => { throw new AppError(400, "해당 메뉴에 리뷰를 작성할 수 없습니다."); };
    assert.equal((await POST(request(valid))).status, 400);
    assert.equal(logs.length, 0);
    store.appendCustomerReview = async () => { throw Error("simulated storage failure"); };
    const response = await POST(request(valid));
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /simulated storage failure/);
    assert.equal(logs.length, 1);
    assert.match(logs[0][0], /reviews/);
  } finally { store.appendCustomerReview = original; console.error = error; }
});
