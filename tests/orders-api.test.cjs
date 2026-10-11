/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
// Load the project's TypeScript domain modules without a second test toolchain.
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith("@/")
      ? path.join(__dirname, "..", request.slice(2))
      : request,
    ...args,
  );
};
const { customerSeed } = require("../lib/admin/customer-seed.ts");
const { setServicesForTests, services } = require("../modules/container.ts");
const { createOrdersService } = require("../modules/orders/service.ts");
const { createMemoryOrdersRepository } = require("../modules/orders/memory-repository.ts");
const { createIdentityService } = require("../modules/identity/service.ts");
const { createMemoryIdentityRepository } = require("../modules/identity/repository.ts");
const { hashPassword } = require("../modules/identity/crypto.ts");
const { createRateLimiter } = require("../modules/shared/rate-limit.ts");

const routes = {
  session: require("../app/api/v1/session/route.ts"),
  login: require("../app/api/v1/auth/login/route.ts"),
  logout: require("../app/api/v1/auth/logout/route.ts"),
  orders: require("../app/api/v1/orders/route.ts"),
  order: require("../app/api/v1/orders/[id]/route.ts"),
  cancel: require("../app/api/v1/orders/[id]/cancel/route.ts"),
  adminOrders: require("../app/api/v1/admin/orders/route.ts"),
  adminStatus: require("../app/api/v1/admin/orders/[id]/status/route.ts"),
};

const BASE = "http://localhost:3000";
const FIXED_NOW = Date.parse("2026-10-10T03:00:00.000Z"); // 한국 시간 2026-10-10 12:00

async function setup() {
  let tick = 0;
  const clock = () => new Date(FIXED_NOW + tick++ * 1000);
  const catalog = customerSeed();
  const admin = { id: "admin-1", loginId: "admin", passwordHash: await hashPassword("test-password") };
  setServicesForTests({
    orders: createOrdersService({
      repository: createMemoryOrdersRepository(clock),
      getCatalog: async () => catalog,
      now: () => new Date(FIXED_NOW),
    }),
    identity: createIdentityService({ repository: createMemoryIdentityRepository([admin]), now: () => new Date(FIXED_NOW) }),
    limits: {
      login: createRateLimiter(5, 60_000),
      order: createRateLimiter(100, 60_000),
      session: createRateLimiter(100, 60_000),
    },
  });
  return catalog;
}

function req(path, { method = "GET", cookie, body, headers = {} } = {}) {
  return new Request(BASE + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const cookieOf = (res) => res.headers.getSetCookie()[0].split(";")[0];
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const json = (res) => res.json();

async function guest() {
  const res = await routes.session.POST(req("/api/v1/session", { method: "POST" }));
  assert.equal(res.status, 201);
  return cookieOf(res);
}
async function adminCookie() {
  const res = await routes.login.POST(req("/api/v1/auth/login", { method: "POST", body: { loginId: "admin", password: "test-password" } }));
  assert.equal(res.status, 200);
  return cookieOf(res);
}
function orderBody(catalog, overrides = {}) {
  const dressing = catalog.products.find((p) => p.type === "dressing" && p.name === "발사믹").id;
  const orange = catalog.products.find((p) => p.type === "drink" && p.name === "오렌지 주스").id;
  return {
    items: [{ productId: 0, dressingKey: dressing, drinkKeys: [orange], quantity: 2 }],
    ordererName: "홍길동",
    phone: "010-1234-5678",
    address: "서울 중구 세종대로 110",
    addressDetail: "5층",
    desiredDate: "2026-10-13",
    desiredSlot: "12:00–13:00",
    ...overrides,
  };
}
const place = (cookie, key, body) =>
  routes.orders.POST(req("/api/v1/orders", { method: "POST", cookie, body, headers: { "idempotency-key": key } }));

test("고객 흐름: 세션 → 주문 → 재전송 → 조회 → 취소", async () => {
  const catalog = await setup();
  const res = await routes.session.POST(req("/api/v1/session", { method: "POST" }));
  assert.equal(res.status, 201);
  const setCookie = res.headers.getSetCookie()[0];
  assert.match(setCookie, /^lb_guest=[\w-]+;/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.ok(!JSON.stringify(await json(res)).includes("lb_guest")); // 토큰은 본문에 없다
  const cookie = setCookie.split(";")[0];

  // 이미 세션이 있으면 새로 만들지 않는다
  const again = await routes.session.POST(req("/api/v1/session", { method: "POST", cookie }));
  assert.equal(again.status, 200);
  assert.equal(again.headers.getSetCookie().length, 0);

  const body = orderBody(catalog);
  const created = await place(cookie, "order-0001-aaaa", body);
  assert.equal(created.status, 201);
  const c = await json(created);
  assert.equal(c.status, "received");
  assert.equal(typeof c.total, "string"); // BigInt 는 문자열
  assert.equal(BigInt(c.total), BigInt(c.subtotal) + BigInt(c.deliveryFee));

  const replay = await place(cookie, "order-0001-aaaa", body);
  assert.equal(replay.status, 200);
  assert.equal((await json(replay)).id, c.id);

  const different = await place(cookie, "order-0001-aaaa", orderBody(catalog, { address: "다른 주소" }));
  assert.equal(different.status, 409);
  assert.deepEqual(Object.keys(await json(different)).sort(), ["message", "status"]);

  const detail = await routes.order.GET(req(`/api/v1/orders/${c.id}`, { cookie }), ctx(c.id));
  assert.equal(detail.status, 200);
  const d = await json(detail);
  assert.equal(d.items[0].options, "발사믹 · 오렌지 주스");
  assert.equal(d.items[0].quantity, 2);
  assert.ok(!("phone" in d) && !("customerSessionId" in d) && !("requestHash" in d));

  // 다른 방문자는 볼 수도 취소할 수도 없다
  const other = await guest();
  assert.equal((await routes.order.GET(req(`/api/v1/orders/${c.id}`, { cookie: other }), ctx(c.id))).status, 404);
  assert.equal((await routes.cancel.POST(req(`/api/v1/orders/${c.id}/cancel`, { method: "POST", cookie: other }), ctx(c.id))).status, 404);

  const cancel = await routes.cancel.POST(req(`/api/v1/orders/${c.id}/cancel`, { method: "POST", cookie, body: { reason: "단순 변심" } }), ctx(c.id));
  assert.equal(cancel.status, 200);
  assert.equal((await json(cancel)).status, "canceled");
  const cancelAgain = await routes.cancel.POST(req(`/api/v1/orders/${c.id}/cancel`, { method: "POST", cookie }), ctx(c.id));
  assert.equal(cancelAgain.status, 200); // 재요청은 현재 결과 반환
});

test("주문 생성 거부 사례", async () => {
  const catalog = await setup();
  const cookie = await guest();
  const ok = orderBody(catalog);
  const expect = async (res, status, re) => {
    assert.equal(res.status, status);
    const b = await json(res);
    assert.equal(b.status, status);
    if (re) assert.match(b.message, re);
  };

  await expect(await routes.orders.POST(req("/api/v1/orders", { method: "POST", body: ok, headers: { "idempotency-key": "order-aaaa-0001" } })), 401);
  await expect(await routes.orders.POST(req("/api/v1/orders", { method: "POST", cookie, body: ok })), 400, /Idempotency-Key/);
  await expect(await place(cookie, "x", ok), 400);
  await expect(
    await routes.orders.POST(req("/api/v1/orders", { method: "POST", cookie, body: ok, headers: { "idempotency-key": "order-aaaa-0002", "sec-fetch-site": "cross-site" } })),
    403,
  );
  await expect(await place(cookie, "order-aaaa-0003", { ...ok, total: 1 }), 400);
  await expect(await place(cookie, "order-aaaa-0004", { ...ok, items: [{ ...ok.items[0], price: 1 }] }), 400);
  await expect(await place(cookie, "order-aaaa-0005", { ...ok, desiredDate: "2026-10-09" }), 400, /받을 날짜/);
  await expect(await place(cookie, "order-aaaa-0011", { ...ok, desiredDate: "2026-10-25" }), 400, /받을 날짜/); // 14일 초과
  await expect(await place(cookie, "order-aaaa-0012", { ...ok, desiredSlot: "자정" }), 400, /시간대/);
  await expect(await place(cookie, "order-aaaa-0013", { ...ok, desiredSlot: "21:00–22:00" }), 400, /시간대/); // 운영시간 밖
  await expect(await place(cookie, "order-aaaa-0006", { ...ok, items: [{ ...ok.items[0], quantity: 1 }] }), 400, /최소 주문/);
  await expect(await place(cookie, "order-aaaa-0007", { ...ok, items: [{ ...ok.items[0], productId: 99 }] }), 400);
  const bad = await routes.orders.POST(new Request(BASE + "/api/v1/orders", { method: "POST", headers: { cookie, "idempotency-key": "order-aaaa-0008" }, body: "{not json" }));
  await expect(bad, 400, /형식/);
  const big = await routes.orders.POST(new Request(BASE + "/api/v1/orders", { method: "POST", headers: { cookie, "idempotency-key": "order-aaaa-0009" }, body: "x".repeat(40_000) }));
  await expect(big, 413);
  assert.equal((await place(cookie, "order-aaaa-0010", ok)).status, 201); // 거부 사례들은 키를 소모하지 않았다
});

test("관리자: 로그인 실패·제한, 목록 쪽 나눔, 상태 변경", async () => {
  const catalog = await setup();
  const wrong = await routes.login.POST(req("/api/v1/auth/login", { method: "POST", body: { loginId: "admin", password: "nope" } }));
  assert.equal(wrong.status, 401);
  assert.deepEqual(await json(wrong), { status: 401, message: "아이디 혹은 패스워드가 다릅니다" });
  const unknown = await routes.login.POST(req("/api/v1/auth/login", { method: "POST", body: { loginId: "ghost", password: "nope" } }));
  assert.deepEqual(await json(unknown), { status: 401, message: "아이디 혹은 패스워드가 다릅니다" }); // 아이디 존재 여부 비노출

  const admin = await adminCookie();
  const g = await guest();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await json(await place(g, `order-list-000${i}`, orderBody(catalog)))).id);

  // 로그인하지 않았거나 비회원 쿠키면 접근 불가
  assert.equal((await routes.adminOrders.GET(req("/api/v1/admin/orders"))).status, 401);
  assert.equal((await routes.adminOrders.GET(req("/api/v1/admin/orders", { cookie: g }))).status, 401);

  const page1 = await json(await routes.adminOrders.GET(req("/api/v1/admin/orders?limit=2", { cookie: admin })));
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);
  assert.deepEqual(page1.items.map((o) => o.id), [ids[2], ids[1]]); // 최신순
  const page2 = await json(await routes.adminOrders.GET(req(`/api/v1/admin/orders?limit=2&cursor=${page1.nextCursor}`, { cookie: admin })));
  assert.deepEqual(page2.items.map((o) => o.id), [ids[0]]);
  assert.equal(page2.nextCursor, null);
  assert.equal((await routes.adminOrders.GET(req("/api/v1/admin/orders?cursor=broken", { cookie: admin }))).status, 400);
  assert.equal((await routes.adminOrders.GET(req("/api/v1/admin/orders?limit=100", { cookie: admin }))).status, 400);
  assert.equal((await routes.adminOrders.GET(req("/api/v1/admin/orders?status=nope", { cookie: admin }))).status, 400);

  const patch = (id, cookie, body) => routes.adminStatus.PATCH(req(`/api/v1/admin/orders/${id}/status`, { method: "PATCH", cookie, body }), ctx(id));
  const target = ids[0];
  assert.equal((await patch(target, g, { status: "confirmed", version: 1 })).status, 401);
  assert.equal((await patch("not-a-uuid", admin, { status: "confirmed", version: 1 })).status, 404);
  assert.equal((await patch(target, admin, { status: "preparing", version: 1 })).status, 409); // 순서 건너뜀

  // 같은 version 으로 동시에 바꾸면 한 명만 성공
  const [a, b] = await Promise.all([patch(target, admin, { status: "confirmed", version: 1 }), patch(target, admin, { status: "canceled", version: 1 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const okRes = a.status === 200 ? a : b;
  const done = await json(okRes);
  assert.equal(done.version, 2);

  const filtered = await json(await routes.adminOrders.GET(req(`/api/v1/admin/orders?status=${done.status}`, { cookie: admin })));
  assert.deepEqual(filtered.items.map((o) => o.id), [target]);

  // 준비 중이 되면 고객은 취소할 수 없다
  if (done.status === "confirmed") {
    assert.equal((await patch(target, admin, { status: "preparing", version: 2 })).status, 200);
    const late = await routes.cancel.POST(req(`/api/v1/orders/${target}/cancel`, { method: "POST", cookie: g }), ctx(target));
    assert.equal(late.status, 409);
  }

  // 로그아웃 후에는 같은 쿠키가 통하지 않는다
  const out = await routes.logout.POST(req("/api/v1/auth/logout", { method: "POST", cookie: admin }));
  assert.equal(out.status, 200);
  assert.match(out.headers.getSetCookie()[0], /Max-Age=0/);
  assert.equal((await routes.adminOrders.GET(req("/api/v1/admin/orders", { cookie: admin }))).status, 401);
});

test("로그인 요청 제한: 한도를 넘으면 429", async () => {
  await setup();
  const attempt = () => routes.login.POST(req("/api/v1/auth/login", { method: "POST", body: { loginId: "admin", password: "bad" }, headers: { "x-forwarded-for": "1.2.3.4" } }));
  for (let i = 0; i < 5; i++) assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 429);
});

test("취소와 상태 변경이 겹치면 한쪽만 적용된다", async () => {
  const catalog = await setup();
  const g = await guest();
  const admin = await adminCookie();
  const id = (await json(await place(g, "order-race-0001", orderBody(catalog)))).id;
  const [cancel, confirm] = await Promise.all([
    routes.cancel.POST(req(`/api/v1/orders/${id}/cancel`, { method: "POST", cookie: g }), ctx(id)),
    routes.adminStatus.PATCH(req(`/api/v1/admin/orders/${id}/status`, { method: "PATCH", cookie: admin, body: { status: "confirmed", version: 1 } }), ctx(id)),
  ]);
  const final = await json(await routes.order.GET(req(`/api/v1/orders/${id}`, { cookie: g }), ctx(id)));
  // 취소는 접수·확인 모두에서 가능하므로 어느 쪽이 먼저든 고객 취소는 성공하고 최종 상태는 취소다
  assert.equal(cancel.status, 200);
  assert.equal(final.status, "canceled");
  assert.ok([200, 409].includes(confirm.status));
});

test("회귀: 같은 키로 동시에 보낸 요청은 주문 한 건만 만든다", async () => {
  const catalog = await setup();
  const cookie = await guest();
  const rs = await Promise.all([1, 2, 3].map(() => place(cookie, "order-same-0001", orderBody(catalog))));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set((await Promise.all(rs.map(json))).map((b) => b.id)).size, 1);
});

test("회귀: 다른 Origin 에서 온 쓰기 요청은 거부", async () => {
  await setup();
  const res = await routes.session.POST(req("/api/v1/session", { method: "POST", headers: { origin: "https://evil.example" } }));
  assert.equal(res.status, 403);
});

test("회귀: X-Forwarded-For 를 바꿔도 같은 계정의 로그인 시도는 제한된다", async () => {
  await setup();
  const statuses = [];
  for (let i = 0; i < 8; i++) {
    const r = await routes.login.POST(req("/api/v1/auth/login", { method: "POST", body: { loginId: "admin", password: "bad" }, headers: { "x-forwarded-for": `9.9.9.${i}` } }));
    statuses.push(r.status);
  }
  assert.equal(statuses.filter((s) => s === 429).length, 3); // 한도 5 → 6번째부터 막힌다
});

test("회귀: 예상 못 한 오류는 503 으로 숨기되 서버 로그에는 남긴다", async () => {
  await setup();
  const cookie = await guest();
  setServicesForTests({ ...services(), orders: {} }); // getOrder 가 없어 TypeError
  const logged = [];
  const original = console.error;
  console.error = (...a) => logged.push(a.join(" "));
  try {
    const id = "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10";
    const res = await routes.order.GET(req(`/api/v1/orders/${id}`, { cookie }), ctx(id));
    assert.equal(res.status, 503);
    assert.deepEqual(await json(res), { status: 503, message: "잠시 후 다시 시도해주세요." });
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 1);
  assert.match(logged[0], /unexpected error/);
});

test("관리자 취소는 사유·시각·변경자를 기록하고, 음료 단품 주문도 접수된다", async () => {
  const catalog = await setup();
  const g = await guest();
  const admin = await adminCookie();
  const id = (await json(await place(g, "order-cancel-0001", orderBody(catalog)))).id;
  const res = await routes.adminStatus.PATCH(
    req(`/api/v1/admin/orders/${id}/status`, { method: "PATCH", cookie: admin, body: { status: "canceled", version: 1, reason: "재료 소진" } }),
    ctx(id),
  );
  assert.equal(res.status, 200);
  const record = await services().orders.getOrder((await services().orders.listOrders({ limit: 5 })).items[0].customerSessionId, id);
  assert.equal(record.cancelReason, "재료 소진");
  assert.ok(record.canceledAt);
  assert.deepEqual(record.history.map((h) => [h.fromStatus, h.toStatus, h.changedBy]), [[null, "received", "customer"], ["received", "canceled", "admin"]]);

  const orange = catalog.products.find((p) => p.type === "drink" && p.name === "오렌지 주스").id;
  const drinks = await place(g, "order-drink-0001", orderBody(catalog, { items: [{ drinkKeys: [orange], quantity: 5 }] }));
  assert.equal(drinks.status, 201); // 4000원 x 5 = 20000, 배달비 3000
  assert.equal((await json(drinks)).total, "23000");
});


test("관리자 화면 어댑터로 실제 로그인·로그아웃 API 계약을 검증한다", async () => {
  await setup();
  const { submitAdminAuth } = require("../lib/admin/auth-client.ts");
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  global.window = { setTimeout, clearTimeout };
  global.fetch = async (url, options) => {
    const handler = url.endsWith("login") ? routes.login : routes.logout;
    return handler.POST(new Request(BASE + url, options));
  };
  try {
    await submitAdminAuth("login", { loginId: "admin", password: "test-password" });
    await assert.rejects(submitAdminAuth("login", { loginId: "admin", password: "wrong" }), /아이디 또는 비밀번호/);
    await submitAdminAuth("logout");
    global.fetch = async () => { throw new TypeError("offline"); };
    await assert.rejects(submitAdminAuth("login", { loginId: "admin", password: "test-password" }), /서버에 연결할 수 없습니다/);
  } finally {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }
});

const adminRoutes = { detail: require("../app/api/v1/admin/orders/[id]/route.ts") };

test("관리자 주문 상세와 접수일 범위 조회 (BE-05)", async () => {
  const catalog = await setup();
  const g = await guest();
  const admin = await adminCookie();
  const created = await json(await place(g, "order-detail-0001", orderBody(catalog)));
  const id = created.id;
  const detailReq = (cookie, target = id) => adminRoutes.detail.GET(req(`/api/v1/admin/orders/${target}`, { cookie }), ctx(target));

  assert.equal((await detailReq(undefined)).status, 401);
  assert.equal((await detailReq(g)).status, 401); // 비회원 쿠키로는 볼 수 없다
  assert.equal((await detailReq(admin, "not-a-uuid")).status, 404);
  assert.equal((await detailReq(admin, "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10")).status, 404);

  await routes.adminStatus.PATCH(req(`/api/v1/admin/orders/${id}/status`, { method: "PATCH", cookie: admin, body: { status: "confirmed", version: 1 } }), ctx(id));
  const res = await detailReq(admin);
  assert.equal(res.status, 200);
  const d = await json(res);
  assert.equal(d.phone, "010-1234-5678"); // 연락처는 관리자 상세에만
  assert.equal(d.version, 2);
  assert.equal(d.items[0].options, "발사믹 · 오렌지 주스");
  assert.deepEqual(d.history.map((h) => [h.fromStatus, h.toStatus, h.changedBy]), [[null, "received", "customer"], ["received", "confirmed", "admin"]]);
  assert.ok(!("customerSessionId" in d) && !("requestHash" in d) && !("requestKey" in d));
  assert.equal(typeof d.total, "string");
  assert.equal(d.cancelReason, null);

  // 기간 조회: 한국 시간 날짜, 양 끝 포함. 목록 항목에는 받을 날짜·시간대가 들어간다
  const list = (qs) => routes.adminOrders.GET(req(`/api/v1/admin/orders${qs}`, { cookie: admin }));
  const day = "2026-10-10"; // 테스트 시계: 한국 시간 2026-10-10 12:00 부터 1초씩
  const hit = await json(await list(`?from=${day}&to=${day}`));
  assert.equal(hit.items.length, 1);
  assert.equal(hit.items[0].desiredDate, "2026-10-13");
  assert.equal(hit.items[0].desiredSlot, "12:00–13:00");
  assert.equal((await json(await list("?from=2000-01-01&to=2000-01-31"))).items.length, 0);
  assert.equal((await json(await list("?from=2026-10-11"))).items.length, 0); // 다음 날부터는 없음
  assert.equal((await json(await list("?to=2026-10-09"))).items.length, 0); // 전날까지는 없음
  assert.equal((await json(await list("?to=2026-10-10"))).items.length, 1); // to 날짜는 그날 끝까지 포함
  assert.equal((await json(await list(`?from=${day}`))).items.length, 1);
  assert.equal((await list("?from=2026-10-12&to=2026-10-01")).status, 400); // 시작이 끝보다 늦음
  assert.equal((await list("?from=2026-13-40")).status, 400);
  assert.equal((await json(await list(`?status=confirmed&from=${day}`))).items.length, 1);
  assert.equal((await json(await list(`?status=received&from=${day}`))).items.length, 0);
});

test("내 주문 목록 (마이페이지용): 본인 세션의 주문만 최신순, 쪽 나눔", async () => {
  const catalog = await setup();
  const a = await guest();
  const b = await guest();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await json(await place(a, `own-list-000${i}`, orderBody(catalog)))).id);
  await place(b, "own-list-other-0", orderBody(catalog));

  const mine = (cookie, qs = "") => routes.orders.GET(req(`/api/v1/orders${qs}`, { cookie }));
  assert.equal((await mine(undefined)).status, 401);
  const page1 = await json(await mine(a, "?limit=2"));
  assert.deepEqual(page1.items.map((o) => o.id), [ids[2], ids[1]]);
  assert.ok(page1.nextCursor);
  const page2 = await json(await mine(a, `?limit=2&cursor=${page1.nextCursor}`));
  assert.deepEqual(page2.items.map((o) => o.id), [ids[0]]);
  assert.equal(page2.nextCursor, null);
  // 다른 방문자의 주문은 섞이지 않고, 연락처는 내려가지 않는다
  assert.equal((await json(await mine(b))).items.length, 1);
  const first = page1.items[0];
  assert.equal(first.items[0].options, "발사믹 · 오렌지 주스");
  assert.ok(!("phone" in first) && !("customerSessionId" in first));
  assert.equal((await mine(a, "?limit=0")).status, 400);
  assert.equal((await mine(a, "?cursor=broken")).status, 400);
});
