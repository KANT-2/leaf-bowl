/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./register-typescript.cjs");
const cart = require("../modules/cart/operations.ts");
const profile = require("../modules/profile/operations.ts");
const { replaceCatalog } = require("../modules/catalog/state.ts");
const { publicSnapshotSchema } = require("../modules/catalog/public-schema.ts");
const { publicSnapshot } = require("../modules/catalog/public-snapshot.ts");
const { customerCatalog } = require("../modules/catalog/customer-view.ts");
const { matchProduct } = require("../modules/bowl/operations.ts");
const { customerSeed } = require("../seed/legacy/catalog.ts");
const { appDefaults } = require("./fixtures/settings.cjs");
const { createMemoryOrdersRepository } = require("./fixtures/memory-orders.ts");
const { createOrdersService } = require("../modules/orders/service.ts");
const { createOrderSchema } = require("../modules/orders/schema.ts");
const at = "2026-10-11T03:00:00.000Z";
const menu = (choice, qty) => ({
  id: 0,
  dressing: -1,
  drinks: [],
  optionSelections: { dressing: [choice], drinks: [] },
  qty,
});

test("cart operations preserve identity, source snapshots and bounded integer quantities", () => {
  const item = menu("dressing-0", 2);
  const inserted = cart.addCartItem([], item);
  item.optionSelections.dressing.push("external-mutation");
  assert.deepEqual(inserted[0].optionSelections.dressing, ["dressing-0"]);
  assert.equal(cart.addCartItem(inserted, menu("dressing-0", 200))[0].qty, 99);
  assert.equal(inserted[0].qty, 2);
  assert.equal(cart.addCartItem([], menu("dressing-1", 2.8))[0].qty, 2);
  assert.equal(cart.addCartItem([], menu("dressing-1", NaN))[0].qty, 1);
  assert.equal(cart.updateCartQuantity(inserted, 0, Infinity), inserted);
});

test("changing a cart option merges into an existing variant and retains its position", () => {
  const items = [
    menu("dressing-0", 2),
    menu("dressing-1", 4),
    { kind: "drink", drink: 0, drinkKey: "drink-0", qty: 1 },
  ];
  const result = cart.changeCartChoice(items, 0, "dressing", "dressing-1");
  assert.equal(result.merged, true);
  assert.deepEqual(result.items, [{ ...items[1], qty: 6 }, items[2]]);
  assert.equal(items[0].qty, 2);
  assert.equal(cart.changeCartChoice(items, 99, "dressing", "dressing-1").items, items);
});

test("adding a cart variant increments or inserts one item without changing the original", () => {
  const items = [menu("dressing-0", 2), menu("dressing-1", 4)];
  const merged = cart.addCartVariant(items, 0, "dressing", "dressing-1");
  assert.equal(merged.index, 1);
  assert.equal(merged.items[1].qty, 5);
  const inserted = cart.addCartVariant(items, 0, "dressing", "dressing-2");
  assert.equal(inserted.index, 1);
  assert.equal(inserted.items[1].qty, 1);
  assert.deepEqual(inserted.items[0], items[0]);
});

test("profile default address changes preserve one default and ignore missing targets", () => {
  let value = profile.loginProfile(null, {
    name: "테스트",
    email: "test@example.com",
    provider: "email",
  });
  value = profile.addProfileAddress(value, { id: "a", isDefault: true });
  const before = value;
  value = profile.addProfileAddress(value, { id: "b", isDefault: true });
  assert.equal(before.addresses[0].isDefault, true);
  assert.deepEqual(
    value.addresses.map((address) => address.isDefault),
    [false, true],
  );
  assert.equal(profile.setDefaultProfileAddress(value, "missing"), value);
  assert.equal(profile.updateProfileAddress(value, "missing", { isDefault: true }), value);
  assert.equal(profile.addProfileAddress(value, { id: "b", isDefault: false }), value);
  assert.deepEqual(
    profile.setDefaultProfileAddress(value, "a").addresses.map((address) => address.isDefault),
    [true, false],
  );
  assert.equal(
    profile.loginProfile(value, {
      name: "다시 로그인",
      email: "test@example.com",
      provider: "google",
    }).addresses,
    value.addresses,
  );
});

test("catalog replacement preserves explicit emptiness, omitted DB fields and stable IDs without seed data", () => {
  const catalog = customerSeed();
  catalog.ingredients = [];
  catalog.reviews = [];
  catalog.products[0].en = "";
  const state = {
    catalog,
    revision: 3,
    updatedAt: at,
    nextCustomerId: 50,
    deletedReviewIds: [],
  };
  const incoming = structuredClone(catalog);
  delete incoming.ingredients;
  delete incoming.reviews;
  incoming.products.push({
    ...incoming.products[0],
    id: "new-product",
    customerId: 999,
  });
  const result = replaceCatalog(state, incoming, at);
  assert.deepEqual(result.catalog.ingredients, []);
  assert.deepEqual(result.catalog.reviews, []);
  assert.equal(result.catalog.products[0].en, "");
  assert.equal(result.catalog.products.at(-1).customerId, 50);
  assert.equal(result.nextCustomerId, 51);
  assert.equal(state.revision, 3);
  assert.equal(result.updatedAt, at);
});

test("customer contract requires DB settings and unknown nutrition is not invented", () => {
  const value = { catalog: customerSeed(), revision: 1, updatedAt: at };
  assert.equal(publicSnapshotSchema.safeParse(value).success, false);
  assert.throws(() => publicSnapshot(value), /DB 설정/);
  const defaults = appDefaults();
  delete defaults.nutrition["0"];
  delete defaults.optionKcal["drink-0"];
  const customer = customerCatalog({ ...value, defaults });
  assert.equal(customer.NUTRITION[0], undefined);
  assert.equal(customer.kcalOf(0, 0, []), undefined);
  assert.equal(customer.kcalOf(1, 0, [0]), undefined);
  assert.equal(customer.kcalOf(1, 0, []), 600);
});

test("bowl recommendations come from supplied DB configuration", () => {
  assert.equal(matchProduct("chicken", { chicken: 5 }), 5);
  assert.equal(matchProduct("chicken", {}), undefined);
});

test("memory order adapter receives catalog and policy at construction, and rolls back failed transactions", async () => {
  const catalog = customerSeed();
  const policy = {
    ...appDefaults().pricingPolicy,
    deliveryFee: 700,
    minDeliveryOrder: 1000,
    freeDeliveryFrom: 99999,
  };
  const repository = createMemoryOrdersRepository({
    getCatalog: async () => catalog,
    getPricingPolicy: async () => policy,
    getDeliveryHours: async () => appDefaults().deliveryHours,
    now: () => new Date(at),
  });
  const service = createOrdersService({
    repository,
    now: () => new Date(at),
  });
  const input = createOrderSchema.parse({
    ordererName: "테스트",
    phone: "010-1234-5678",
    address: "서울 중구",
    desiredStartAt: "2026-10-13T03:00:00.000Z",
    desiredEndAt: "2026-10-13T04:00:00.000Z",
    items: [{ productId: 0, dressingKey: "dressing-0", quantity: 1 }],
  });
  const result = await service.createOrder("guest", "injected-policy", input);
  assert.equal(result.order.deliveryFee, 700n);
  assert.equal(result.order.total, 11600n);
  await assert.rejects(
    repository.transaction(async (transaction) => {
      await transaction.create({ ...result.order, requestKey: "rolled-back" });
      throw Error("rollback");
    }),
    /rollback/,
  );
  assert.equal(await repository.findByRequest("guest", "rolled-back"), null);
  const replay = await service.createOrder("guest", "injected-policy", input);
  assert.equal(replay.created, false);
  assert.equal(replay.order.id, result.order.id);
});

test("DB dictionary lookups never treat inherited names as configured data", () => {
  assert.equal(matchProduct("constructor", {}), undefined);
  const catalog = customerSeed();
  catalog.products[0].category = "constructor";
  catalog.ingredients[0].id = "constructor";
  catalog.products.find((product) => product.type === "drink").id = "constructor";
  const customer = customerCatalog({
    catalog,
    revision: 1,
    updatedAt: at,
    defaults: appDefaults(),
  });
  assert.equal(customer.getProduct(0).category, "other");
  assert.equal(customer.ingredients[0].emoji, "");
  assert.equal(customer.DRINK_KCAL[0], undefined);
});
