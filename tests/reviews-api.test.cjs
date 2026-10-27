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

test("review photos reject corrupt data, save three images and clean files after a failed database write", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const directory = await fs.mkdtemp(path.join(require("node:os").tmpdir(), "review-images-"));
  const previousDirectory = process.env.ADMIN_DATA_DIR;
  const originalAppend = store.appendPurchasedReview;
  const maintenance = require("../application/images.ts");
  const originalMaintenance = maintenance.maintainImages;
  const originalError = console.error;
  process.env.ADMIN_DATA_DIR = directory;
  maintenance.maintainImages = async () => {};
  console.error = () => {};
  const png = await require("sharp")({ create: { width: 1, height: 1, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  const photo = "data:image/png;base64," + png.toString("base64");
  let written;
  try {
    for (const corrupt of [
      "data:image/png;base64,AAAA",
      "data:image/png;base64," + png.toString("base64") + "=",
      "data:image/png;base64," + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString("base64"),
    ]) {
      assert.equal((await POST(request(JSON.stringify({ ...JSON.parse(valid), photos: [corrupt] })))).status, 400);
    }
    assert.deepEqual(await fs.readdir(directory), []);
    store.appendPurchasedReview = async (_session, input) => {
      written = input.images;
      assert.equal(written.length, 3);
      for (const url of written) {
        assert.ok((await fs.stat(path.join(directory, "images", url.split("/").at(-1)))).isFile());
      }
      throw Error("synthetic database rollback");
    };
    const body = JSON.stringify({ ...JSON.parse(valid), photos: [photo, photo, photo] });
    assert.equal((await POST(request(body))).status, 503);
    assert.deepEqual(await fs.readdir(path.join(directory, "images")), []);
    const { withDefaults } = require("./fixtures/settings.cjs");
    const { customerSeed } = require("../seed/legacy/catalog.ts");
    store.appendPurchasedReview = async (_session, input) => {
      written = input.images;
      const catalog = customerSeed();
      catalog.reviews[0].images = written;
      return withDefaults({ catalog, revision: 2, updatedAt: new Date().toISOString() });
    };
    assert.equal((await POST(request(body))).status, 200);
    assert.equal((await fs.readdir(path.join(directory, "images"))).length, 3);
  } finally {
    store.appendPurchasedReview = originalAppend;
    maintenance.maintainImages = originalMaintenance;
    console.error = originalError;
    if (previousDirectory === undefined) {
      delete process.env.ADMIN_DATA_DIR;
    } else {
      process.env.ADMIN_DATA_DIR = previousDirectory;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("member reviews are authorized by FastAPI /api/me together with this browser's guest session", async () => {
  const { GET } = require("../app/api/reviews/route.ts");
  const originalFetch = global.fetch;
  const originalOwn = store.ownReviewSubmissions;
  const calls = [];
  const seen = [];
  let me = { status: 200, body: { id: 42, email: "member@example.com" } };
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), authorization: init.headers.authorization });
    if (!me.status) {
      throw new TypeError("fetch failed");
    }
    return Response.json(me.body, { status: me.status });
  };
  store.verifyReviewPurchase = async (identity) => {
    seen.push(identity);
    throw new AppError(404, "리뷰를 작성할 주문 품목을 찾을 수 없습니다.");
  };
  store.ownReviewSubmissions = async (identity) => {
    seen.push(identity);
    return [{ reviewId: "member-review", orderItemId: "7" }];
  };
  const memberRequest = (authorization, { cookie = "lb_guest=test-guest", method = "POST" } = {}) =>
    new Request("http://localhost:3000/api/reviews", {
      method,
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        authorization,
        ...(cookie ? { cookie } : {}),
      },
      body: method === "POST" ? valid : undefined,
    });
  try {
    assert.equal((await POST(memberRequest("Bearer a.b.c"))).status, 404);
    assert.deepEqual(seen.at(-1), { customerId: 42n, customerSessionId: "own-session" });
    assert.match(calls.at(-1).url, /\/api\/me$/);
    assert.equal(calls.at(-1).authorization, "Bearer a.b.c");

    // 회원 토큰만으로도 충분하다 (비회원 세션 쿠키 없음)
    assert.equal((await POST(memberRequest("Bearer a.b.c", { cookie: null }))).status, 404);
    assert.deepEqual(seen.at(-1), { customerId: 42n });
    const listed = await GET(memberRequest("Bearer a.b.c", { cookie: null, method: "GET" }));
    assert.equal(listed.status, 200);
    assert.deepEqual((await listed.json()).submissions, [{ reviewId: "member-review", orderItemId: "7" }]);
    assert.deepEqual(seen.at(-1), { customerId: 42n });

    // 형식이 틀린 토큰은 FastAPI 에 보내지 않고 401
    const before = calls.length;
    assert.equal((await POST(memberRequest("Basic a.b.c"))).status, 401);
    assert.equal(calls.length, before);

    me = { status: 401, body: { error: { code: "unauthorized", message: "만료" } } };
    assert.equal((await POST(memberRequest("Bearer a.b.c"))).status, 401);
    me = { status: 0 };
    assert.equal((await POST(memberRequest("Bearer a.b.c"))).status, 503);
    me = { status: 200, body: { id: "42" } };
    assert.equal((await POST(memberRequest("Bearer a.b.c"))).status, 503);
    assert.equal(seen.length, 3);
  } finally {
    global.fetch = originalFetch;
    store.ownReviewSubmissions = originalOwn;
  }
});
