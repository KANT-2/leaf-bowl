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
const { setServicesForTests } = require("../modules/container.ts");
const { createOrdersService } = require("../modules/orders/service.ts");
const { createMemoryOrdersRepository } = require("../modules/orders/memory-repository.ts");
const { createIdentityService } = require("../modules/identity/service.ts");
const { createMemoryIdentityRepository } = require("../modules/identity/repository.ts");
const { hashPassword } = require("../modules/identity/crypto.ts");
const { createRateLimiter } = require("../modules/shared/rate-limit.ts");
const { adminGate } = require("../modules/identity/legacy-admin.ts");
const sessionRoute = require("../app/api/v1/auth/session/route.ts");
const guestRoute = require("../app/api/v1/session/route.ts");
const loginRoute = require("../app/api/v1/auth/login/route.ts");
const logoutRoute = require("../app/api/v1/auth/logout/route.ts");
const { proxy } = require("../proxy.ts");
const { NextRequest } = require("next/server");

const B = "http://localhost:3000";
async function setup() {
  setServicesForTests({
    orders: createOrdersService({ repository: createMemoryOrdersRepository(), getCatalog: async () => ({}) }),
    identity: createIdentityService({ repository: createMemoryIdentityRepository([{ id: "a1", loginId: "admin", passwordHash: await hashPassword("pw") }]) }),
    limits: { login: createRateLimiter(50, 60000), order: createRateLimiter(50, 60000), session: createRateLimiter(50, 60000) },
  });
}
const req = (path, { method = "GET", cookie, body } = {}) =>
  new Request(B + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
const cookieOf = (r) => r.headers.getSetCookie()[0].split(";")[0];
const adminLogin = async () => cookieOf(await loginRoute.POST(req("/api/v1/auth/login", { method: "POST", body: { loginId: "admin", password: "pw" } })));

test("adminGate: 로그인하지 않았거나 비회원 쿠키면 기존 오류 모양({ error })의 401, 관리자 세션이면 통과", async () => {
  await setup();
  const none = await adminGate(req("/api/admin/catalog"));
  assert.equal(none.status, 401);
  assert.deepEqual(await none.json(), { error: "로그인이 필요합니다." });
  assert.equal(none.headers.get("cache-control"), "no-store");
  const guest = cookieOf(await guestRoute.POST(req("/api/v1/session", { method: "POST" })));
  assert.equal((await adminGate(req("/api/admin/catalog", { cookie: guest }))).status, 401);
  assert.equal((await adminGate(req("/api/admin/catalog", { cookie: "lb_admin=forged-token" }))).status, 401);
  assert.equal(await adminGate(req("/api/admin/catalog", { cookie: await adminLogin() })), null);
});

test("GET /api/v1/auth/session: 관리자 로그인 상태 확인, 로그아웃하면 다시 401", async () => {
  await setup();
  assert.equal((await sessionRoute.GET(req("/api/v1/auth/session"))).status, 401);
  const admin = await adminLogin();
  const ok = await sessionRoute.GET(req("/api/v1/auth/session", { cookie: admin }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.authenticated, true);
  assert.ok(!JSON.stringify(body).includes(admin.split("=")[1])); // 토큰은 본문에 없다
  await logoutRoute.POST(req("/api/v1/auth/logout", { method: "POST", cookie: admin }));
  assert.equal((await sessionRoute.GET(req("/api/v1/auth/session", { cookie: admin }))).status, 401);
  assert.equal(await adminGate(req("/api/admin/catalog", { cookie: admin })).then((r) => r.status), 401);
});

test("proxy: /admin 은 쿠키가 없으면 로그인 화면으로, 다른 경로는 건드리지 않는다", () => {
  const call = (path, cookie) => proxy(new NextRequest(B + path, { headers: cookie ? { cookie } : {} }));
  const redirect = call("/admin");
  assert.equal(redirect.status, 307);
  assert.equal(new URL(redirect.headers.get("location")).pathname, "/admin/login");
  assert.equal(call("/admin/").status, 307);
  assert.equal(call("/admin", "lb_admin=abc").headers.get("location"), null); // 쿠키가 있으면 통과
  for (const path of ["/admin/login", "/admin/logout", "/admin/preview", "/menu", "/api/admin/catalog"]) {
    assert.equal(call(path).headers.get("location"), null, path);
  }
});
