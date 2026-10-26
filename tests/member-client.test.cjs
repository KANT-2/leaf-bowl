/* eslint-disable @typescript-eslint/no-require-imports */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
require("./register-typescript.cjs");
const client = require("../features/member/client.ts");
const { memberTokenStore } = require("../infrastructure/browser/member-token.ts");

// 토큰 만료는 실제 시계(Date.now)로 판단하므로, 고정 날짜를 쓰면 그 날짜가 지난 뒤 테스트가 실패한다
const NOW = Date.now();
const ORDER = {
  id: "5cd63d2a-f8e0-43ed-aae9-03b07f193d2c",
  status: "received",
  ordererName: "김종복",
  address: "서울 중구 세종대로 110",
  addressDetail: "5층",
  desiredStartAt: "2026-10-25T03:00:00.000Z",
  desiredEndAt: "2026-10-25T04:00:00.000Z",
  desiredDate: "2026-10-25",
  desiredSlot: "12:00–13:00",
  items: [
    {
      id: "23",
      productId: "salad-0",
      productType: "salad",
      name: "레몬 치킨 아보카도",
      options: "발사믹",
      unitPrice: "10900",
      quantity: 2,
    },
  ],
  subtotal: "21800",
  deliveryFee: "3000",
  total: "24800",
  createdAt: "2026-10-24T03:00:00.000Z",
};

/** fetch 를 바꿔 끼우고 받은 요청을 기록한다 */
function stubFetch(...responses) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, init, headers: init.headers ?? {} });
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }
    return typeof next === "function" ? next() : next;
  };
  return calls;
}

const json = (body, status = 200) => Response.json(body, { status });

const signedIn = () => memberTokenStore.set({ token: "jwt-1", expiresAt: Date.now() + 60_000 });

const previousFetch = global.fetch;
beforeEach(() => {
  global.fetch = previousFetch;
  memberTokenStore.set(null);
});

test("login posts the OAuth2 form, keeps the token until shortly before expiry and loads the member", async () => {
  const calls = stubFetch(
    json({ access_token: "jwt-1", token_type: "bearer", expires_in: 3600 }),
    json({ id: 7, email: "leaf@example.com", name: "김종복", phone: "010-1234-5678" }),
  );
  const member = await client.loginMember(" leaf@example.com ", "salad1234", NOW);
  assert.deepEqual(member, { id: 7, email: "leaf@example.com", name: "김종복", phone: "010-1234-5678" });
  assert.equal(calls[0].url, "/backend/api/auth/token");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body.toString(), "username=leaf%40example.com&password=salad1234");
  assert.equal(calls[1].url, "/backend/api/me");
  assert.equal(calls[1].headers.authorization, "Bearer jwt-1");
  assert.deepEqual(memberTokenStore.getSnapshot(), { token: "jwt-1", expiresAt: NOW + 3570 * 1000 });
});

test("a failed login shows the server message and keeps no token", async () => {
  stubFetch(json({ error: { code: "unauthorized", message: "이메일 또는 비밀번호가 올바르지 않습니다." } }, 401));
  await assert.rejects(client.loginMember("a@b.co", "wrong"), /이메일 또는 비밀번호가 올바르지 않습니다/);
  assert.equal(memberTokenStore.getSnapshot(), null);

  stubFetch(json({ access_token: "jwt-1", expires_in: 3600 }), json({ unexpected: true }));
  await assert.rejects(client.loginMember("a@b.co", "salad1234"), /회원 정보/);
  assert.equal(memberTokenStore.getSnapshot(), null);
});

test("signup sends JSON and maps a blank phone to null", async () => {
  const calls = stubFetch(json({ id: 1, email: "a@b.co", name: "김", phone: null }, 201));
  await client.signupMember({ email: "a@b.co", password: "salad1234", name: "김", phone: "  " });
  assert.equal(calls[0].url, "/backend/api/auth/signup");
  assert.equal(calls[0].headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: "a@b.co", password: "salad1234", name: "김", phone: null });
});

test("authenticated calls need a live token and a 401 logs the member out", async () => {
  let calls = stubFetch();
  await assert.rejects(client.loadMemberOrders(), client.MemberAuthError);
  assert.equal(calls.length, 0, "토큰이 없으면 서버에 묻지 않는다");

  memberTokenStore.set({ token: "old", expiresAt: Date.now() - 1 });
  await assert.rejects(client.loadMemberOrders(), client.MemberAuthError);
  assert.equal(memberTokenStore.getSnapshot(), null, "만료된 토큰은 지운다");

  signedIn();
  calls = stubFetch(json({ error: { code: "unauthorized", message: "로그아웃한 토큰입니다." } }, 401));
  await assert.rejects(client.loadMemberOrders(), (e) => e instanceof client.MemberAuthError && /만료/.test(e.message));
  assert.equal(memberTokenStore.getSnapshot(), null);
});

test("member orders are submitted with the retry key and parsed like guest orders", async () => {
  signedIn();
  const calls = stubFetch(json({ id: ORDER.id, status: "received", total: "24800" }, 201));
  const input = {
    items: [],
    ordererName: "김종복",
    phone: "010-1234-5678",
    address: "서울",
    desiredStartAt: ORDER.desiredStartAt,
    desiredEndAt: ORDER.desiredEndAt,
  };
  assert.deepEqual(await client.submitMemberOrder(input, "key-12345678"), { id: ORDER.id, total: 24800 });
  assert.equal(calls[0].url, "/backend/api/v1/orders");
  assert.equal(calls[0].headers["idempotency-key"], "key-12345678");
  assert.equal(calls[0].headers.authorization, "Bearer jwt-1");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ...input, items: [] });

  stubFetch(json({ id: ORDER.id, total: "abc" }, 201));
  await assert.rejects(client.submitMemberOrder(input, "key-12345678"), /주문 접수 결과/);
});

test("business rule errors keep the server message", async () => {
  signedIn();
  stubFetch(json({ error: { code: "business_rule_violation", message: "최소 주문 금액은 15,000원입니다." } }, 400));
  await assert.rejects(
    client.submitMemberOrder({ items: [] }, "key-12345678"),
    (e) => !(e instanceof client.MemberAuthError) && e.message === "최소 주문 금액은 15,000원입니다.",
  );
  assert.ok(memberTokenStore.getSnapshot(), "400 은 로그인 상태를 바꾸지 않는다");
});

test("order list uses the cursor and the shared order parser", async () => {
  signedIn();
  const calls = stubFetch(json({ items: [ORDER], nextCursor: "next-1" }));
  const page = await client.loadMemberOrders("cur-0");
  assert.equal(calls[0].url, "/backend/api/v1/orders?limit=20&cursor=cur-0");
  assert.equal(page.nextCursor, "next-1");
  assert.equal(page.items[0].total, 24800);
  assert.equal(page.items[0].address, "서울 중구 세종대로 110 5층");
  assert.deepEqual(page.items[0].items[0], {
    id: "23",
    productId: "salad-0",
    productType: "salad",
    name: "레몬 치킨 아보카도",
    options: "발사믹",
    qty: 2,
    unitPrice: 10900,
  });
  stubFetch(json({ items: "nope" }));
  await assert.rejects(client.loadMemberOrders(), /주문 내역/);
});

test("cancel posts to the order and only received or confirmed orders are cancelable", async () => {
  signedIn();
  const calls = stubFetch(json({ id: ORDER.id, status: "canceled", canceledAt: "2026-10-24T03:05:00.000Z" }));
  assert.deepEqual(await client.cancelMemberOrder(ORDER.id), {
    status: "canceled",
    canceledAt: "2026-10-24T03:05:00.000Z",
  });
  assert.equal(calls[0].url, `/backend/api/v1/orders/${ORDER.id}/cancel`);
  assert.deepEqual(JSON.parse(calls[0].init.body), {});
  assert.deepEqual(
    ["received", "confirmed", "preparing", "delivering", "completed", "canceled"].map(client.isCancelable),
    [true, true, false, false, false, false],
  );
});

test("network failures and non-JSON answers are explained, and logout always clears the token", async () => {
  signedIn();
  stubFetch(new TypeError("offline"));
  await assert.rejects(client.loadMemberOrders(), /연결하지 못했습니다/);
  stubFetch(new Response("<html>", { status: 502 }));
  await assert.rejects(client.loadMemberOrders(), /응답을 확인하지 못했습니다/);

  const calls = stubFetch(new TypeError("offline"));
  await client.logoutMember();
  assert.equal(calls[0].url, "/backend/api/auth/logout");
  assert.equal(memberTokenStore.getSnapshot(), null);

  const none = stubFetch();
  await client.logoutMember();
  assert.equal(none.length, 0, "토큰이 없으면 서버에 묻지 않는다");
});
