/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./register-typescript.cjs");
const { customerSeed } = require("../lib/admin/customer-seed.ts");
const { priceOrder, deliveryFee } = require("../modules/orders/pricing.ts");
const status = require("../modules/orders/status.ts");
const schema = require("../modules/orders/schema.ts");
const { requestHash } = require("../modules/orders/request-hash.ts");
const { AppError, errorBody } = require("../modules/shared/errors.ts");
const { toJson } = require("../modules/shared/json.ts");
const { encodeCursor, decodeCursor } = require("../modules/shared/cursor.ts");
const idc = require("../modules/identity/crypto.ts");

const big = (n) => BigInt(n);
const throws400 = (fn, re) =>
  assert.throws(fn, (e) => e instanceof AppError && e.status === 400 && (!re || re.test(e.message)));
const catalog = () => customerSeed();
const drinkKey = (c, name) => c.products.find((p) => p.type === "drink" && p.name === name).id;
const dressingKey = (c, name) => c.products.find((p) => p.type === "dressing" && p.name === name).id;
const parse = (o) => schema.createOrderSchema.parse(o);
const base = {
  ordererName: "홍길동",
  phone: "010-1234-5678",
  address: "서울 중구 세종대로 110",
  desiredDate: "2026-10-13",
  desiredSlot: "12:00–13:00",
};

test("status: 허용된 순서만 통과하고 완료·취소는 끝이다", () => {
  const flow = ["received", "confirmed", "preparing", "delivering", "completed"];
  for (let i = 0; i < flow.length - 1; i++) assert.ok(status.canTransition(flow[i], flow[i + 1]));
  assert.ok(!status.canTransition("received", "preparing"));
  assert.ok(!status.canTransition("completed", "canceled"));
  for (const s of status.ORDER_STATUSES) {
    if (s === "completed" || s === "canceled") assert.deepEqual([...status.nextStatuses(s)], []);
    assert.ok(!status.canTransition(s, s));
  }
  assert.ok(status.isCancelable("received") && status.isCancelable("confirmed"));
  assert.ok(!status.isCancelable("preparing") && !status.isCancelable("delivering"));
  assert.throws(() => status.assertTransition("received", "completed"), (e) => e.status === 409);
});

test("status: 취소 재요청은 현재 결과를 반환하고, 준비 시작 후에는 409", () => {
  assert.equal(status.resolveCancel("received"), "cancel");
  assert.equal(status.resolveCancel("canceled"), "already-canceled");
  assert.throws(() => status.resolveCancel("preparing"), (e) => e.status === 409);
  assert.throws(() => status.resolveCancel("completed"), (e) => e.status === 409);
});

test("pricing: 서버가 카탈로그 가격으로 계산하고 배달비 규칙을 적용한다", () => {
  const c = catalog();
  const salad0 = c.products.find((p) => p.customerId === 0);
  const orange = drinkKey(c, "오렌지 주스");
  const orangePrice = c.products.find((p) => p.id === orange).price;
  const r = priceOrder(c, [
    schema.orderItemSchema.parse({
      productId: 0,
      dressingKey: dressingKey(c, "발사믹"),
      drinkKeys: [orange],
      quantity: 2,
    }),
  ]);
  const unit = big(salad0.price + orangePrice);
  assert.equal(r.lines[0].unitPrice, unit);
  assert.equal(r.subtotal, unit * big(2));
  assert.equal(r.deliveryFee, r.subtotal >= big(30000) ? big(0) : big(3000));
  assert.equal(r.total, r.subtotal + r.deliveryFee);
  assert.equal(r.lines[0].productId, salad0.id);
  assert.equal(r.lines[0].options.dressing.name, "발사믹");
  assert.equal(deliveryFee(big(29999)), big(3000));
  assert.equal(deliveryFee(big(30000)), big(0));
});

test("pricing: 거부해야 하는 주문", () => {
  const c = catalog();
  const dressing = dressingKey(c, "참깨");
  const item = (extra = {}) => schema.orderItemSchema.parse({ productId: 0, dressingKey: dressing, quantity: 2, ...extra });
  priceOrder(c, [item()]); // 기준: 통과
  throws400(() => priceOrder(c, [item({ quantity: 1 })]), /최소 주문/);
  throws400(() => priceOrder(c, [item({ productId: 99 })]), /존재하지 않는/);
  throws400(() => priceOrder(c, [item({ dressingKey: undefined })]), /드레싱을 선택/);
  throws400(() => priceOrder(c, [item({ dressingKey: "dressing-99" })]), /드레싱/);
  throws400(() => priceOrder(c, [item({ drinkKeys: ["drink-99"] })]), /음료/);
  const orange = drinkKey(c, "오렌지 주스");
  throws400(() => priceOrder(c, [item({ drinkKeys: [orange, orange] })]), /중복/);

  const sold = catalog();
  sold.products.find((p) => p.customerId === 0).status = "soldout";
  throws400(() => priceOrder(sold, [item()]), /품절/);
  const hidden = catalog();
  hidden.products.find((p) => p.customerId === 0).status = "hidden";
  throws400(() => priceOrder(hidden, [item()]), /존재하지 않는/);
  const deleted = catalog();
  deleted.products.find((p) => p.customerId === 0).deleted = true;
  throws400(() => priceOrder(deleted, [item()]), /존재하지 않는/);
  const dressingSold = catalog();
  dressingSold.products.find((p) => p.id === dressing).status = "soldout";
  throws400(() => priceOrder(dressingSold, [item()]), /품절된 드레싱/);
  const customGroup = catalog();
  const g = customGroup.groups.find((x) => x.id === "dressing");
  g.source = "custom";
  g.choices = [{ id: "dressing-x", name: "특제 소스", price: 500 }];
  const r = priceOrder(customGroup, [item({ dressingKey: "dressing-x" })]);
  assert.equal(r.lines[0].options.dressing.price, 500);
  throws400(() => priceOrder(customGroup, [item({ dressingKey: dressing })]), /드레싱/);
  const drinkSold = catalog();
  drinkSold.products.find((p) => p.id === orange).status = "soldout";
  throws400(() => priceOrder(drinkSold, [item({ drinkKeys: [orange] })]), /품절된 음료/);
});

test("pricing: 내 취향 조합은 화면의 bowlPrice(기본 볼 + 재료)와 같고, 품절·숨김 재료는 거부", () => {
  const { BASE_BOWL_PRICE } = require("../lib/match.ts");
  const c = catalog();
  const priced = c.ingredients.filter((i) => i.price !== undefined && i.status === "active" && !i.deleted).slice(0, 4);
  assert.equal(priced.length, 4);
  const keys = priced.map((i) => i.id);
  const sum = priced.reduce((n, i) => n + i.price, 0);
  const mk = (ks, extra = {}) => schema.orderItemSchema.parse({ ingredientKeys: ks, quantity: 99, ...extra });
  const r = priceOrder(c, [mk(keys)]);
  assert.equal(r.lines[0].unitPrice, big(BASE_BOWL_PRICE + sum));
  assert.equal(r.lines[0].productId, null);
  // 드레싱을 고르면 그 드레싱 가격이 더해지고 스냅샷에 남는다
  const dr = priceOrder(c, [mk(keys, { dressingKey: dressingKey(c, "시저") })]);
  assert.equal(dr.lines[0].options.dressing.name, "시저");
  throws400(() => priceOrder(c, [mk(keys, { dressingKey: "dressing-99" })]), /드레싱/);
  throws400(() => priceOrder(c, [mk(keys, { drinkKeys: [drinkKey(c, "오렌지 주스")] })]), /음료/);
  const target = c.ingredients.find((i) => i.id === keys[0]);
  target.status = "soldout";
  throws400(() => priceOrder(c, [mk(keys)]), /품절된 재료/);
  target.status = "hidden";
  throws400(() => priceOrder(c, [mk(keys)]), /선택할 수 없는 재료/);
  throws400(() => priceOrder(catalog(), [mk(["nope"])]), /선택할 수 없는 재료/);
  throws400(() => priceOrder(catalog(), [mk([keys[0], keys[0]])]), /중복/);
});

test("pricing: 음료 단품 주문 (장바구니의 음료 줄)", () => {
  const c = catalog();
  const orange = drinkKey(c, "오렌지 주스");
  const price = c.products.find((p) => p.id === orange).price;
  const item = (extra = {}) => schema.orderItemSchema.parse({ drinkKeys: [orange], quantity: 4, ...extra });
  const r = priceOrder(c, [item()]);
  assert.equal(r.lines[0].unitPrice, big(price));
  assert.equal(r.lines[0].name, "오렌지 주스");
  assert.equal(r.subtotal, big(price * 4));
  // 형태 검사: 음료 2개 단품, 드레싱 동반, 음료도 메뉴도 재료도 없음은 거부
  assert.throws(() => item({ drinkKeys: [orange, orange] }));
  assert.throws(() => item({ dressingKey: "dressing-0" }));
  assert.throws(() => schema.orderItemSchema.parse({ quantity: 1 }));
  c.products.find((p) => p.id === orange).status = "soldout";
  throws400(() => priceOrder(c, [item()]), /품절된 음료/);
  throws400(() => priceOrder(catalog(), [item({ drinkKeys: ["drink-99"] })]), /선택할 수 없는 음료/);
});

test("schema: 주문 입력 검사 (가격 변조 필드·형식 오류 거부)", () => {
  const item = { productId: 0, dressingKey: "dressing-0", quantity: 1 };
  const ok = parse({ ...base, items: [item] });
  assert.deepEqual(ok.items[0].drinkKeys, []);
  assert.equal(ok.addressDetail, "");
  const bad = (o) => assert.throws(() => parse({ ...base, items: [item], ...o }));
  bad({ phone: "123" });
  bad({ desiredDate: "2026-02-30" });
  bad({ desiredDate: "10/13" });
  bad({ ordererName: "  " });
  bad({ total: 1 }); // strict: 알 수 없는 필드
  assert.throws(() => parse({ ...base, items: [{ ...item, price: 1 }] }));
  assert.throws(() => parse({ ...base, items: [] }));
  assert.throws(() => parse({ ...base, items: [{ ...item, quantity: 0 }] }));
  assert.throws(() => parse({ ...base, items: [{ ...item, quantity: 100 }] }));
  assert.throws(() => parse({ ...base, items: [{ quantity: 1 }] })); // 메뉴도 재료도 없음
  assert.throws(() => parse({ ...base, items: [{ ...item, ingredientKeys: ["romaine"] }] })); // 둘 다
  assert.ok(schema.idempotencyKeySchema.safeParse("order-20261009-0001").success);
  assert.ok(!schema.idempotencyKeySchema.safeParse("짧음").success);
  assert.ok(!schema.changeStatusSchema.safeParse({ status: "done", version: 1 }).success);
  assert.ok(!schema.changeStatusSchema.safeParse({ status: "confirmed", version: 0 }).success);
  assert.equal(schema.adminOrderListQuerySchema.parse({}).limit, 20);
  assert.equal(schema.adminOrderListQuerySchema.parse({ limit: "5" }).limit, 5);
  assert.ok(!schema.adminOrderListQuerySchema.safeParse({ limit: "51" }).success);
});

test("request-hash: 같은 내용은 같고 다른 내용은 다르다", () => {
  const mk = (drinkKeys, quantity) =>
    parse({ ...base, items: [{ productId: 0, dressingKey: "dressing-0", drinkKeys, quantity }] });
  const a = mk(["drink-1", "drink-2"], 1);
  assert.equal(requestHash(a), requestHash(mk(["drink-2", "drink-1"], 1)));
  assert.notEqual(requestHash(a), requestHash(mk(["drink-1", "drink-2"], 2)));
  assert.notEqual(requestHash(a), requestHash(parse({ ...base, address: "다른 주소", items: a.items })));
  assert.match(requestHash(a), /^[0-9a-f]{64}$/);
});

test("shared: 에러 본문, BigInt 문자열 변환, 커서", () => {
  assert.deepEqual(errorBody(new AppError(404, "주문을 찾을 수 없습니다.")), { status: 404, message: "주문을 찾을 수 없습니다." });
  assert.deepEqual(errorBody(new Error("DB password leaked")), { status: 503, message: "잠시 후 다시 시도해주세요." });
  assert.deepEqual(toJson({ total: big("24800"), n: 1, nested: [{ fee: big(3000) }] }), { total: "24800", n: 1, nested: [{ fee: "3000" }] });
  const cur = { createdAt: "2026-10-09T05:30:00.000Z", id: "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10" };
  assert.deepEqual(decodeCursor(encodeCursor(cur)), cur);
  const raws = ["", "abc", Buffer.from("{}").toString("base64url"), Buffer.from(JSON.stringify({ c: "x", i: "y" })).toString("base64url")];
  for (const raw of raws) assert.throws(() => decodeCursor(raw), (e) => e.status === 400);
});

test("identity: 토큰 해시(64자)와 비밀번호 해시 검증", async () => {
  const t1 = idc.newSessionToken();
  assert.notEqual(t1, idc.newSessionToken());
  assert.match(idc.hashToken(t1), /^[0-9a-f]{64}$/);
  assert.equal(idc.hashToken(t1), idc.hashToken(t1));
  assert.notEqual(idc.hashToken(t1), t1);
  const h = await idc.hashPassword("correct horse");
  assert.ok(h.length <= 255 && h.startsWith("scrypt$"));
  assert.notEqual(h, await idc.hashPassword("correct horse")); // 소금이 매번 다르다
  assert.equal(await idc.verifyPassword("correct horse", h), true);
  assert.equal(await idc.verifyPassword("wrong", h), false);
  assert.equal(await idc.verifyPassword("x", "plain"), false);
});


test("pricing: 모든 연결 그룹의 필수·다중 선택과 고객 화면 금액을 검증한다", () => {
  const c = catalog();
  const drinkGroup = c.groups.find((g) => g.source === "drinks");
  drinkGroup.required = true;
  const item = (extra = {}) => schema.orderItemSchema.parse({ productId: 0, dressingKey: dressingKey(c, "참깨"), quantity: 2, ...extra });
  throws400(() => priceOrder(c, [item()]), /음료.*선택/);
  const group = { id: "extra", name: "추가 토핑", source: "custom", required: true, multiple: false, choices: [{ id: "nuts", name: "견과", price: 800 }], deleted: false };
  c.groups.push(group);
  c.products.find((p) => p.customerId === 0).optionIds.push(group.id);
  throws400(() => priceOrder(c, [item({ drinkKeys: [drinkKey(c, "오렌지 주스")] })]), /추가 토핑.*선택/);
  const selections = { [c.groups.find((g) => g.source === "dressings").id]: [dressingKey(c, "참깨")], [drinkGroup.id]: [drinkKey(c, "오렌지 주스")], extra: ["nuts"] };
  const input = schema.orderItemSchema.parse({ productId: 0, optionSelections: selections, quantity: 2 });
  const priced = priceOrder(c, [input]);
  const { customerCatalog } = require("../lib/customer/catalog.ts");
  const client = customerCatalog({ catalog: c, revision: 1, updatedAt: "" });
  assert.equal(Number(priced.lines[0].unitPrice), client.itemUnitPrice({ id: 0, dressing: -1, drinks: [], optionSelections: selections, qty: 2 }));
  assert.equal(priced.lines[0].options.custom[0].name, "견과");
  throws400(() => priceOrder(c, [{ ...input, optionSelections: { ...selections, extra: ["nuts", "nuts"] } }]), /중복/);
  throws400(() => priceOrder(c, [{ ...input, optionSelections: { ...selections, unlinked: ["nuts"] } }]), /연결되지/);
  assert.throws(() => schema.orderItemSchema.parse({ ...input, dressingKey: "dressing-0" }));
  c.products.find((p) => p.id === selections[drinkGroup.id][0]).status = "soldout";
  throws400(() => priceOrder(c, [input]), /품절/);
});
