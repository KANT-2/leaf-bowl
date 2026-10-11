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
const { setServicesForTests, createLimits } = require("../modules/container.ts");
const { createOrdersService } = require("../modules/orders/service.ts");
const { createMemoryOrdersRepository } = require("../modules/orders/memory-repository.ts");
const { createIdentityService } = require("../modules/identity/service.ts");
const { createMemoryIdentityRepository } = require("../modules/identity/repository.ts");
const { hashToken, hashPassword, loginRateKey, LOGIN_BUCKETS } = require("../modules/identity/crypto.ts");
const { createRateLimiter, clientKey } = require("../modules/shared/rate-limit.ts");
const { AppError } = require("../modules/shared/errors.ts");
const sessionRoute = require("../app/api/v1/session/route.ts");
const loginRoute = require("../app/api/v1/auth/login/route.ts");
const ordersRoute = require("../app/api/v1/orders/route.ts");
const orderRoute = require("../app/api/v1/orders/[id]/route.ts");

const B = "http://localhost:3000";
const DAY = 24 * 3600_000;
const T0 = Date.parse("2026-10-10T03:00:00Z"); // 한국 시간 2026-10-10 12:00
const req = (path, { method = "POST", headers = {}, cookie, body } = {}) =>
  new Request(B + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const issue = (headers) => sessionRoute.POST(req("/api/v1/session", { headers }));
const cookieOf = (r) => r.headers.getSetCookie()[0].split(";")[0];
const withProxyHops = async (hops, fn) => {
  const before = process.env.TRUSTED_PROXY_HOPS;
  if (hops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = String(hops);
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = before;
  }
};
const count = (codes, c) => codes.filter((x) => x === c).length;
const createServices = () => ({
  orders: createOrdersService({ repository: createMemoryOrdersRepository(), getCatalog: async () => customerSeed() }),
  identity: createIdentityService({ repository: createMemoryIdentityRepository() }),
  limits: createLimits(),
});

test("clientKey: 신뢰할 프록시를 설정하지 않으면 X-Forwarded-For 를 믿지 않는다", async () => {
  const r = (h) => new Request(B, { headers: h });
  await withProxyHops(undefined, () => assert.equal(clientKey(r({ "x-forwarded-for": "1.1.1.1" })), null));
  await withProxyHops(0, () => assert.equal(clientKey(r({ "x-forwarded-for": "1.1.1.1" })), null));
  await withProxyHops("abc", () => assert.equal(clientKey(r({ "x-forwarded-for": "1.1.1.1" })), null));
  await withProxyHops(1, () => {
    assert.equal(clientKey(r({ "x-forwarded-for": "spoofed, 2.2.2.2" })), "2.2.2.2"); // 프록시가 덧붙인 오른쪽 끝
    assert.equal(clientKey(r({})), null);
  });
  await withProxyHops(2, () => {
    assert.equal(clientKey(r({ "x-forwarded-for": "spoofed, 3.3.3.3, 10.0.0.1" })), "3.3.3.3");
    assert.equal(clientKey(r({ "x-forwarded-for": "10.0.0.1" })), null); // 기대한 단계 수보다 짧으면 믿지 않는다
  });
});

test("세션 발급: 헤더를 매번 바꿔도 전체 발급 속도는 한도를 넘지 못한다", async () => {
  setServicesForTests(createServices());
  const codes = [];
  for (let i = 0; i < 150; i++) codes.push((await issue({ "x-forwarded-for": `10.0.0.${i}` })).status);
  assert.equal(count(codes, 201), 120);
  assert.equal(count(codes, 429), 30);
});

test("세션 발급: 신뢰할 프록시가 있으면 요청자별 한도도 적용되고, 앞쪽 위조 값으로는 피할 수 없다", async () => {
  await withProxyHops(1, async () => {
    setServicesForTests(createServices());
    const codes = [];
    for (let i = 0; i < 31; i++) codes.push((await issue({ "x-forwarded-for": `spoof-${i}, 9.9.9.9` })).status);
    assert.equal(count(codes, 201), 30);
    assert.equal(codes[30], 429); // 같은 실제 주소(오른쪽 끝)는 31번째가 막힌다
    assert.equal((await issue({ "x-forwarded-for": "spoof, 8.8.8.8" })).status, 201); // 다른 주소는 영향 없음
  });
});

test("세션 발급: 이미 유효한 세션이 있는 재방문은 발급 한도를 쓰지 않는다", async () => {
  setServicesForTests({ ...createServices(), limits: createLimits({ globalSession: 1 }) });
  const first = await issue();
  assert.equal(first.status, 201);
  const cookie = cookieOf(first);
  for (let i = 0; i < 5; i++) assert.equal((await sessionRoute.POST(req("/api/v1/session", { cookie }))).status, 200);
  assert.equal((await issue()).status, 429); // 새 세션은 한도에 걸린다
});

test("만료된 세션은 새 세션을 발급할 때 정리되고, 유효한 세션은 남는다", async () => {
  let t = T0;
  const repo = createMemoryIdentityRepository();
  const svc = createIdentityService({ repository: repo, now: () => new Date(t) });
  const old = [];
  for (let i = 0; i < 10; i++) old.push((await svc.issueGuestSession()).token);
  t += 29 * DAY; // 아직 만료 전 (30일)
  const alive = (await svc.issueGuestSession()).token;
  for (const tk of old) assert.ok(await repo.findSessionByTokenHash(hashToken(tk)), "유효한 세션은 지워지지 않는다");
  t += 2 * DAY; // 처음 10개는 만료, alive 는 아직 유효
  await svc.issueGuestSession();
  for (const tk of old) assert.equal(await repo.findSessionByTokenHash(hashToken(tk)), null);
  assert.ok(await repo.findSessionByTokenHash(hashToken(alive)));
  assert.equal(await repo.countSessions("guest", new Date(t)), 2);
});

test("비회원 세션 상한: 가득 차면 503, 만료되면 다시 발급, 이미 가진 세션은 계속 쓴다", async () => {
  let t = T0;
  const repo = createMemoryIdentityRepository();
  const svc = createIdentityService({ repository: repo, now: () => new Date(t), maxGuestSessions: 3 });
  const tokens = [];
  for (let i = 0; i < 3; i++) tokens.push((await svc.issueGuestSession()).token);
  await assert.rejects(() => svc.issueGuestSession(), (e) => e instanceof AppError && e.status === 503);
  assert.ok(await svc.resolve(tokens[0], "guest")); // 기존 방문자는 영향 없음
  t += 31 * DAY;
  await svc.issueGuestSession(); // 만료되어 자리가 생김
  assert.equal(await repo.countSessions("guest", new Date(t)), 1);
});

test("비회원 세션 상한: 동시에 많이 발급해도 상한을 넘지 않는다", async () => {
  const repo = createMemoryIdentityRepository();
  const svc = createIdentityService({ repository: repo, now: () => new Date(T0), maxGuestSessions: 3 });
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => svc.issueGuestSession()));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(ok, 3);
  assert.equal(rejected.length, 17);
  assert.ok(rejected.every((r) => r.reason instanceof AppError && r.reason.status === 503));
  assert.equal(await repo.countSessions("guest", new Date(T0)), 3); // 예전에는 20 이 되었다
});

test("요청 제한기: 서로 다른 키를 많이 넣어도 빠르고 키 개수는 상한을 넘지 않는다", () => {
  const limiter = createRateLimiter(10, 60_000);
  const started = Date.now();
  for (let i = 0; i < 20_000; i++) limiter.hit("key-" + i);
  const elapsed = Date.now() - started;
  assert.ok(limiter.size() <= 10_000, "키 개수 " + limiter.size());
  assert.ok(elapsed < 1000, "20,000 키 처리 " + elapsed + "ms (예전에는 약 4,000ms)");
  const small = createRateLimiter(1, 60_000, { maxKeys: 3 });
  for (const k of ["a", "b", "c", "d"]) small.hit(k);
  assert.equal(small.size(), 3); // 가장 오래된 키가 밀려났다
});

test("요청 제한기: 한도 초과는 429, 시간 구간이 지나면 다시 허용, 만료된 키는 정리", () => {
  let t = 0;
  const limiter = createRateLimiter(2, 1000, { now: () => t });
  limiter.hit("k");
  limiter.hit("k");
  assert.throws(() => limiter.hit("k"), (e) => e instanceof AppError && e.status === 429);
  limiter.hit("other"); // 다른 키는 별개
  t = 1001;
  limiter.hit("k"); // 구간이 지나 다시 허용
  assert.equal(limiter.size(), 1); // 만료된 other 는 정리되었다
});

async function loginSetup(limits) {
  const now = () => new Date(T0);
  setServicesForTests({
    orders: createOrdersService({ repository: createMemoryOrdersRepository(), getCatalog: async () => ({}) }),
    identity: createIdentityService({ repository: createMemoryIdentityRepository([{ id: "a1", loginId: "admin", passwordHash: await hashPassword("pw") }]), now }),
    limits,
  });
}
const login = (loginId, password, headers) => loginRoute.POST(req("/api/v1/auth/login", { body: { loginId, password }, headers }));

test("로그인 제한: 'ghost-0'~'ghost-299' 300개 샘플에서는 키가 상한 안이고 실제 관리자 로그인이 막히지 않았다 (일반 보장이 아님)", async () => {
  // 한정된 샘플 검증이다. 아이디는 1,024칸을 공유하므로, admin 과 같은 칸에 걸리는 아이디를 고르면
  // 관리자 로그인이 막힐 수 있다 (아래 'collision-687' 테스트). 이 샘플은 그 칸을 우연히 피한 것뿐이다.
  const limits = createLimits({ account: 5, clientLogin: 1000, globalLogin: 1000 });
  await loginSetup(limits);
  for (let i = 0; i < 300; i++) await login("ghost-" + i, "x", { "x-forwarded-for": "7.7.7." + i });
  assert.ok(limits.account.size() <= LOGIN_BUCKETS, "키 " + limits.account.size() + "개 (상한 " + LOGIN_BUCKETS + ")");
  const sampleBuckets = new Set(Array.from({ length: 300 }, (_, i) => loginRateKey("ghost-" + i)));
  assert.ok(!sampleBuckets.has(loginRateKey("admin")), "샘플이 admin 과 같은 칸을 쓰면 이 단언의 전제가 깨진다");
  assert.equal((await login("admin", "pw")).status, 200); // 이 300개 샘플은 admin 의 칸을 쓰지 않았으므로 막히지 않았다
});

test("로그인 제한: 존재하지 않는 'collision-687' 이 admin 과 같은 칸(account:741)을 쓰면 기본 한도 10 뒤 관리자 로그인이 429, 60초 뒤 200", async () => {
  // 결정적 충돌: 아이디는 1,024칸을 공유하고 칸 안에서는 카운터를 같이 쓴다 (아이디별 독립 카운터가 아니다).
  assert.equal(loginRateKey("collision-687"), loginRateKey("admin"));
  assert.equal(loginRateKey("admin"), "account:741");
  let t = 0;
  const limits = createLimits({ clientLogin: 1000, globalLogin: 1000 }, () => t); // account 기본 한도 10/분
  await loginSetup(limits);
  for (let i = 0; i < 10; i++) assert.equal((await login("collision-687", "wrong")).status, 401);
  assert.equal((await login("admin", "pw")).status, 429); // 올바른 비밀번호여도 같은 칸이 소진되어 막힌다 (직접 admin 을 10회 공격한 것과 같은 효과)
  t += 60_000;
  assert.equal((await login("admin", "pw")).status, 200); // 한 구간(60초)이 지나 풀린다
});

test("로그인 제한: 응답이 계정 존재 여부를 드러내지 않는다 (모르는 아이디와 실제 계정이 같은 응답)", async () => {
  const run = async (loginId, before) => {
    const limits = createLimits({ account: 5, clientLogin: 1000, globalLogin: 1000 });
    await loginSetup(limits);
    for (let i = 0; i < before; i++) await login("ghost-spray", "x"); // 다른 모르는 아이디를 먼저 소진
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await login(loginId, "wrong")).status);
    return statuses;
  };
  for (const before of [0, 8, 50]) {
    const known = await run("admin", before);
    const unknown = await run("ghost-other", before);
    assert.deepEqual(known, unknown, "앞선 시도 " + before + "회 뒤 응답 순서가 같아야 한다");
    assert.deepEqual(known, [401, 401, 401, 401, 401, 429, 429, 429]);
  }
});

test("로그인 제한: 같은 아이디는 대소문자·공백이 달라도 같은 칸을 쓴다", () => {
  assert.equal(loginRateKey("Admin"), loginRateKey(" admin "));
  assert.match(loginRateKey("x"), /^account:\d+$/);
  assert.notEqual(loginRateKey("admin"), loginRateKey("administrator-x"));
});

test("로그인 제한: 전체 한도가 비밀번호 검사 총량을 막는다", async () => {
  await loginSetup(createLimits({ account: 1000, clientLogin: 1000, globalLogin: 5 }));
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await login("ghost-" + i, "x")).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429, 429, 429]);
});

test("로그인 제한: 접속자 헤더를 바꿔도 같은 계정의 틀린 시도는 한도에서 막히고, 구간이 지나면 풀린다", async () => {
  let t = 0;
  const limits = createLimits({ account: 5, clientLogin: 1000, globalLogin: 1000 }, () => t);
  await loginSetup(limits);
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await login("admin", "wrong", { "x-forwarded-for": "6.6.6." + i })).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429, 429, 429]);
  t += 61_000;
  assert.equal((await login("admin", "pw")).status, 200);
});

test("기존 주문 조회: 세션 정리와 새 방문자 발급이 있어도 유효한 세션의 주문은 계속 조회된다", async () => {
  let idClock = T0;
  const catalog = customerSeed();
  const dressing = catalog.products.find((p) => p.type === "dressing").id;
  setServicesForTests({
    orders: createOrdersService({ repository: createMemoryOrdersRepository(), getCatalog: async () => catalog, now: () => new Date(T0) }),
    identity: createIdentityService({ repository: createMemoryIdentityRepository(), now: () => new Date(idClock) }),
    limits: createLimits({ globalSession: 1000, clientSession: 1000 }),
  });
  const cookie = cookieOf(await issue());
  const placed = await ordersRoute.POST(req("/api/v1/orders", {
    cookie,
    headers: { "idempotency-key": "keep-order-0001" },
    body: { items: [{ productId: 0, dressingKey: dressing, quantity: 2 }], ordererName: "A", phone: "010-1234-5678", address: "x", desiredDate: "2026-10-13", desiredSlot: "12:00–13:00" },
  }));
  assert.equal(placed.status, 201);
  const id = (await placed.json()).id;
  const get = (c) => orderRoute.GET(req("/api/v1/orders/" + id, { method: "GET", cookie: c }), { params: Promise.resolve({ id }) });

  idClock += 29 * DAY; // 정리가 돌지만 이 세션은 아직 유효
  for (let i = 0; i < 20; i++) assert.equal((await issue()).status, 201);
  assert.equal((await get(cookie)).status, 200);

  idClock += 2 * DAY; // 30일이 지나 이 세션은 만료 → 쿠키로는 더 이상 조회할 수 없고, 새 방문자에게는 보이지 않는다
  const fresh = cookieOf(await issue());
  assert.equal((await get(cookie)).status, 401);
  assert.equal((await get(fresh)).status, 404);
});
