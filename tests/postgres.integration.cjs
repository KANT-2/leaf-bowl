/* eslint-disable @typescript-eslint/no-require-imports */
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createPrismaClient, prisma, databaseTransaction } = require("../infrastructure/database/prisma.ts");
const { customerSeed } = require("../seed/legacy/catalog.ts");
const { lockCatalog, readCatalogState } = require("../infrastructure/catalog/postgres.ts");
const { readCatalog, writeCatalog, appendCustomerReview } = require("../application/catalog.ts");
const { importCatalogFile } = require("../seed/import-catalog.ts");
const { createPostgresOrdersRepository } = require("../infrastructure/orders/postgres.ts");
const { createOrdersService } = require("../modules/orders/service.ts");
const { createOrderSchema } = require("../modules/orders/schema.ts");
const { createPostgresIdentityRepository } = require("../infrastructure/identity/postgres.ts");
const { createIdentityService } = require("../modules/identity/service.ts");
const { hashPassword, hashToken } = require("../modules/identity/crypto.ts");
const { readSalesData } = require("../application/sales.ts");
const { buildSalesReport } = require("../modules/reports/sales.ts");
const { updateProduct, findProductById } = require("../application/products.ts");
const { createServices, setServicesForTests } = require("../application/container.ts");
const { applyDefaultSql } = require("../seed/sql.ts");
const { customerCatalog } = require("../modules/catalog/customer-view.ts");
const { getDeliveryHours } = require("../infrastructure/settings/postgres.ts");
const { matchProduct } = require("../modules/bowl/operations.ts");
const { createPostgresPaymentsRepository } = require("../infrastructure/payments/postgres.ts");
const { createPaymentsService } = require("../modules/payments/service.ts");

const url = process.env.DATABASE_URL;
const name = decodeURIComponent(new URL(url).pathname.slice(1));
assert.match(name, /(?:^|[_-])test$/, "Refusing to modify a non-test database");
const db = prisma();
const now = () => new Date("2026-10-11T03:00:00Z");
let administrator;
let directory;

async function reset() {
  const [{ name: actualName }] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(actualName, name, "Test connection must resolve to the guarded database");
  await db.$executeRawUnsafe(
    "TRUNCATE review_submissions, app_settings, catalog_meta, catalog_imports, deleted_review_ids, products, ingredients, option_groups, allergens, categories, reviews, site_content, season_pages, store_location, orders, admin_users, sessions RESTART IDENTITY CASCADE",
  );
}

function orderService(database = db) {
  return createOrdersService({ repository: createPostgresOrdersRepository(database), now });
}

function input(extra = {}) {
  return createOrderSchema.parse({
    ordererName: "DB 테스트",
    phone: "010-1234-5678",
    address: "서울 중구 세종대로 110",
    desiredStartAt: "2026-10-13T03:00:00.000Z",
    desiredEndAt: "2026-10-13T04:00:00.000Z",
    items: [{ productId: 0, dressingKeys: ["dressing-0"], drinkKeys: ["drink-1"], quantity: 2 }],
    ...extra,
  });
}
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "leaf-bowl-postgres-"));
  process.env.ADMIN_DATA_DIR = directory;
  await reset();
});
beforeEach(async () => {
  await reset();
  await applyDefaultSql(url);
  administrator = await db.adminUser.create({
    data: { loginId: "integration-admin", passwordHash: await hashPassword("integration-password") },
  });
});
after(async () => {
  await reset();
  await db.$disconnect();
  await fs.rm(directory, { recursive: true, force: true });
});

async function catalogVersions() {
  return db.$queryRawUnsafe(`
    SELECT 'product:' || id AS key, xmin::text AS version FROM products
    UNION ALL SELECT 'group:' || id, xmin::text FROM option_groups
    UNION ALL SELECT 'choice:' || group_id || ':' || id, xmin::text FROM option_choices
    UNION ALL SELECT 'link:' || product_id || ':' || group_id, xmin::text FROM product_option_groups
    UNION ALL SELECT 'ingredient:' || id, xmin::text FROM ingredients
    UNION ALL SELECT 'review:' || id, xmin::text FROM reviews
    UNION ALL SELECT 'image:' || review_id || ':' || position, xmin::text FROM review_images
    UNION ALL SELECT 'drink:' || review_id || ':' || position, xmin::text FROM review_drinks
    UNION ALL SELECT 'category:' || name, xmin::text FROM categories
    UNION ALL SELECT 'content:' || id, xmin::text FROM site_content
    UNION ALL SELECT 'page:' || id, xmin::text FROM season_pages
    UNION ALL SELECT 'location:' || id, xmin::text FROM store_location
    UNION ALL SELECT 'product-allergen:' || product_id || ':' || allergen_id, xmin::text FROM product_allergens
    UNION ALL SELECT 'ingredient-allergen:' || ingredient_id || ':' || allergen_id, xmin::text FROM ingredient_allergens
    ORDER BY key
  `);
}

test("a product price edit preserves every unrelated catalog row and product timestamp", async () => {
  const state = await readCatalog();
  const before = await catalogVersions();
  const timestamps = await db.product.findMany({ orderBy: { id: "asc" }, select: { id: true, updatedAt: true } });
  const product = state.catalog.products[0];
  product.price += 100;
  const result = await writeCatalog(state.catalog, state.revision);
  assert.equal(result.revision, state.revision + 1);
  const after = await catalogVersions();
  assert.deepEqual(
    after.filter((row) => row.key !== "product:" + product.id),
    before.filter((row) => row.key !== "product:" + product.id),
  );
  const unchanged = await db.product.findMany({
    where: { id: { not: product.id } },
    orderBy: { id: "asc" },
    select: { id: true, updatedAt: true },
  });
  assert.deepEqual(
    unchanged,
    timestamps.filter((row) => row.id !== product.id),
  );
});

test("review insertion and retry preserve all existing rows, including review photos and drinks", async () => {
  const state = await readCatalog();
  state.catalog.reviews[0].images = ["/images/hero-cutout.png"];
  state.catalog.reviews[0].drinks = ["오렌지 주스"];
  await writeCatalog(state.catalog, state.revision);
  const before = await catalogVersions();
  const input = {
    id: "review-preserved",
    pid: 0,
    author: "테스트",
    stars: 5,
    title: "리뷰 제목",
    text: "충분히 긴 리뷰 본문입니다.",
    via: "delivery",
    images: ["/images/hero-cutout.png"],
  };
  const first = await appendCustomerReview(input);
  const after = await catalogVersions();
  for (const row of before) {
    assert.deepEqual(
      after.find((next) => next.key === row.key),
      row,
      row.key,
    );
  }
  assert.equal((await readCatalog()).catalog.reviews[0].id, input.id);
  assert.equal((await appendCustomerReview(input)).revision, first.revision);
  assert.deepEqual(await catalogVersions(), after);
  const edit = await readCatalog();
  edit.catalog.products[0].price += 100;
  await writeCatalog(edit.catalog, edit.revision);
  assert.deepEqual(
    (await catalogVersions()).filter(
      (row) => row.key.startsWith("review:") || row.key.startsWith("image:") || row.key.startsWith("drink:"),
    ),
    after.filter(
      (row) => row.key.startsWith("review:") || row.key.startsWith("image:") || row.key.startsWith("drink:"),
    ),
  );
});

test("partial persistence handles option changes, allergen links, review removal and reordering", async () => {
  const state = await readCatalog();
  const removedReview = state.catalog.reviews[0];
  state.catalog.reviews = state.catalog.reviews.slice(1).reverse();
  state.catalog.groups.push({
    id: "extra-test",
    name: "테스트 옵션",
    source: "custom",
    required: false,
    multiple: true,
    deleted: false,
    choices: [
      { id: "one", name: "첫 선택", price: 100 },
      { id: "two", name: "두 번째", price: 200 },
    ],
  });
  state.catalog.products[0].optionIds.push("extra-test");
  state.catalog.products[0].allergens = "우유 · 대두";
  state.catalog.ingredients[0].allergens = "우유";
  state.catalog.content.heroTitle = "수정 제목";
  const result = await writeCatalog(state.catalog, state.revision);
  assert.deepEqual((await readCatalog()).catalog, result.catalog);
  assert.equal(await db.review.count({ where: { id: removedReview.id } }), 0);
  assert.ok(await db.deletedReviewId.findUnique({ where: { id: removedReview.id } }));
  const links = await db.productAllergen.findMany({
    where: { productId: state.catalog.products[0].id },
    include: { allergen: true },
    orderBy: { position: "asc" },
  });
  assert.deepEqual(
    links.map((row) => row.allergen.name),
    ["우유", "대두"],
  );
  const edit = await readCatalog();
  edit.catalog.groups.at(-1).choices.reverse();
  edit.catalog.groups.at(-1).choices[0].price += 100;
  edit.catalog.products[0].optionIds = edit.catalog.products[0].optionIds.filter((id) => id !== "extra-test");
  edit.catalog.groups.at(-1).deleted = true;
  const saved = await writeCatalog(edit.catalog, edit.revision);
  assert.deepEqual((await readCatalog()).catalog, saved.catalog);
});

test("standalone SQL initializes every current default field and application setting", async () => {
  const state = await readCatalog();
  const expected = customerSeed();
  const json = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(json(state.catalog.products), json(expected.products));
  assert.deepEqual(json(state.catalog.ingredients), json(expected.ingredients));
  assert.deepEqual(json(state.catalog.groups), json(expected.groups));
  assert.deepEqual(json(state.catalog.content), json(expected.content));
  assert.deepEqual(
    json(state.catalog.reviews),
    json(expected.reviews.map((review) => ({ ...review, images: [], drinks: [] }))),
  );
  assert.equal(state.revision, 1);
  assert.equal((await db.catalogMeta.findUnique({ where: { id: 1 } })).nextCustomerId, 12);
  assert.deepEqual(state.defaults.heroSlides, require("../seed/legacy/hero.ts").HERO_SLIDES);
  assert.deepEqual(Object.values(state.defaults.nutrition), require("../seed/legacy/nutrition.ts").NUTRITION);
  assert.deepEqual(state.defaults.pricingPolicy, require("./fixtures/settings.cjs").appDefaults().pricingPolicy);
  assert.deepEqual(await getDeliveryHours(), { days: "매일", open: 10, close: 21 });
  const customer = customerCatalog(state);
  assert.equal(customer.heroSlides.length, 3);
  assert.equal(customer.kcalOf(0, 0, [1]), customer.NUTRITION[0].kcal + 120 + 110);
  assert.equal(await db.order.count(), 0);
  assert.equal(await db.session.count(), 0);
});

test("SQL reruns preserve catalog edits, settings, orders and deletion history", async () => {
  const session = await db.session.create({
    data: { tokenHash: hashToken("sql-seed-guest"), kind: "guest", expiresAt: new Date("2027-01-01T00:00:00Z") },
  });
  const { order } = await orderService().createOrder(session.id, "sql-seed-original-order", input());
  const state = await readCatalog();
  state.catalog.products[0].price += 1000;
  state.catalog.reviews = state.catalog.reviews.slice(1);
  await writeCatalog(state.catalog, state.revision);
  await db.appSetting.update({
    where: { key: "delivery_hours" },
    data: { value: { days: "평일", open: 9, close: 22 }, updatedAt: now() },
  });
  const before = await readCatalog();
  const removed = await db.deletedReviewId.findMany();
  await Promise.all([applyDefaultSql(url), applyDefaultSql(url)]);
  assert.deepEqual(await readCatalog(), before);
  assert.deepEqual(await db.deletedReviewId.findMany(), removed);
  assert.equal(await db.order.count(), 1);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).total, order.total);
  assert.equal(await db.adminUser.count(), 1);
});

test("failed SQL initialization rolls back settings and all inserted catalog rows", async () => {
  await reset();
  const filename = path.join(directory, "failing-seed.sql");
  const sql = await fs.readFile(path.join(__dirname, "../db/seed.sql"), "utf8");
  assert.match(sql, /INSERT INTO catalog_meta/);
  await fs.writeFile(
    filename,
    sql.replace("INSERT INTO catalog_meta", "RAISE EXCEPTION 'forced-seed-failure';\n  INSERT INTO catalog_meta"),
  );
  await assert.rejects(applyDefaultSql(url, filename), /forced-seed-failure/);
  for (const model of [
    "appSetting",
    "product",
    "ingredient",
    "review",
    "category",
    "allergen",
    "catalogMeta",
    "siteContent",
  ]) {
    assert.equal(await db[model].count(), 0);
  }
  // An incomplete pre-existing catalog is reported without modifying it.
  const product = customerSeed().products[0];
  await db.product.create({
    data: {
      id: product.id,
      type: product.type,
      name: product.name,
      price: product.price,
      category: product.category,
      sortOrder: 0,
    },
  });
  await assert.rejects(applyDefaultSql(url), /메타데이터 없는 기존 앱 데이터/);
  assert.equal(await db.product.count(), 1);
  assert.equal(await db.appSetting.count(), 0);
});

test("database policy and hours drive both customer totals and order validation", async () => {
  const settings = { deliveryFee: 700, minDeliveryOrder: 1000, freeDeliveryFrom: 99999, baseBowlPrice: 9000 };
  await db.appSetting.update({ where: { key: "pricing_policy" }, data: { value: settings, updatedAt: now() } });
  const state = await readCatalog();
  const customer = customerCatalog(state);
  const custom = {
    kind: "custom",
    ingredientIds: ["romaine", "chicken"],
    ingredients: [],
    name: "SQL 볼",
    allergens: [],
    dressing: 0,
    dressingKey: "dressing-0",
    price: 0,
    photo: 0,
    qty: 2,
  };
  assert.equal(customer.itemUnitPrice(custom), 11000);
  assert.equal(customer.deliveryFee(22000), 700);
  const session = await db.session.create({
    data: { tokenHash: hashToken("sql-policy-guest"), kind: "guest", expiresAt: new Date("2027-01-01T00:00:00Z") },
  });
  const { order } = await orderService().createOrder(
    session.id,
    "sql-policy-order",
    input({ items: [{ ingredientKeys: ["romaine", "chicken"], dressingKeys: ["dressing-0"], quantity: 2 }] }),
  );
  assert.equal(order.subtotal, 22000n);
  assert.equal(order.deliveryFee, 700n);
  assert.equal(order.total, 22700n);
  await db.appSetting.update({
    where: { key: "delivery_hours" },
    data: { value: { days: "매일", open: 14, close: 21 }, updatedAt: now() },
  });
  await assert.rejects(
    orderService().createOrder(session.id, "outside-db-hours", input()),
    (error) => error.status === 400,
  );
  assert.equal(await db.order.count(), 1);
});

test("catalog revisions, optional fields, stable IDs and review deletion survive a fresh client", async () => {
  let state = await readCatalog();
  state.catalog.location = { name: "매장", address: "서울", detailAddress: "1층" };
  state.catalog.ingredients[0].origin = "국내산";
  state.catalog.ingredients[0].originDetail = "제주";
  state.catalog.content.seasonPages = [];
  state.catalog.products[0].price = 16000;
  state.catalog.products[0].origin = "국내산";
  state.catalog.products.push({ ...state.catalog.products[0], id: "new-salad", customerId: undefined });
  const saved = await writeCatalog(state.catalog, state.revision);
  assert.equal(saved.catalog.products.at(-1).customerId, 12);
  assert.equal(await writeCatalog(state.catalog, state.revision), null);
  const results = await Promise.all([
    writeCatalog(saved.catalog, saved.revision),
    writeCatalog(saved.catalog, saved.revision),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const review = {
    id: "customer-db-review",
    pid: 0,
    author: "고객",
    stars: 5,
    title: "리뷰",
    text: "실제 DB에 보존되는 리뷰입니다.",
    via: "delivery",
    images: ["/api/admin/images/test.png"],
  };
  state = await appendCustomerReview(review);
  const revision = state.revision;
  assert.equal((await appendCustomerReview(review)).revision, revision);
  state.catalog.reviews = state.catalog.reviews.filter((row) => row.id !== review.id);
  state = await writeCatalog(state.catalog, state.revision);
  assert.equal((await appendCustomerReview(review)).revision, state.revision);
  const fresh = createPrismaClient(url);
  try {
    const actual = await databaseTransaction(fresh, async (tx) => {
      await lockCatalog(tx, "read");
      return readCatalogState(tx);
    });
    assert.equal(actual.catalog.products[0].price, 16000);
    assert.equal(actual.catalog.products[0].origin, "국내산");
    assert.equal(actual.catalog.products.at(-1).customerId, 12);
    assert.equal(actual.nextCustomerId, 13);
    assert.equal(actual.catalog.ingredients[0].originDetail, "제주");
    assert.deepEqual(actual.catalog.location, state.catalog.location);
    assert.deepEqual(actual.catalog.content.seasonPages, []);
    assert.ok(actual.deletedReviewIds.includes(review.id));
    assert.ok(!actual.catalog.reviews.some((row) => row.id === review.id));
    assert.equal((await findProductById(0)).price, 16000);
    await updateProduct(0, { price: 17000, isNew: true, isOnSale: false, tag: undefined });
    const product = (await readCatalog()).catalog.products[0];
    assert.equal(product.price, 17000);
    assert.equal(product.status, "soldout");
    assert.equal(product.isNew, true);
    assert.equal(product.badge, "");
  } finally {
    await fresh.$disconnect();
  }
});

test("shared, hidden, trash and banner references retain images until the final reference is removed", async () => {
  const { saveImage, imageExists } = require("../infrastructure/images/files.ts");
  const { pruneExpiredImages } = require("../application/images.ts");
  const { readEvents, writeEvents } = require("../application/events.ts");
  const bytes = await require("sharp")({ create: { width: 1, height: 1, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  const key = await saveImage({ bytes, ext: "png" });
  const url = "/api/admin/images/" + key;
  let events = await readEvents();
  events = await writeEvents(
    [
      {
        id: "shared-event",
        title: "이벤트",
        description: "",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        image: url,
        mobileImage: "",
        alt: "",
        href: "",
        visible: false,
      },
    ],
    events.revision,
  );
  let state = await readCatalog();
  state.catalog.products[0].image = url;
  state.catalog.ingredients[0].image = url;
  state.catalog.content.bannerPages = [
    { id: "hidden-banner", image: "", mobileImage: url, alt: "", href: "", visible: false },
  ];
  state = await writeCatalog(state.catalog, state.revision);
  const past = new Date(Date.now() - 25 * 3600_000);
  await fs.utimes(path.join(directory, "images", key), past, past);
  state.catalog.products[0].deleted = true;
  state.catalog.ingredients[0].image = "";
  state = await writeCatalog(state.catalog, state.revision);
  await pruneExpiredImages(true);
  assert.equal(await imageExists(key), true);
  state.catalog.products[0].deleted = false;
  state.catalog.products[0].image = "";
  state = await writeCatalog(state.catalog, state.revision);
  assert.equal(await imageExists(key), true);
  state.catalog.content.bannerPages = [];
  state = await writeCatalog(state.catalog, state.revision);
  assert.equal(await imageExists(key), true);
  await writeEvents([], events.revision);
  assert.equal(await imageExists(key), false);
  state.catalog.products[0].image = url;
  await assert.rejects(writeCatalog(state.catalog, state.revision), (error) => error.status === 400);
  assert.equal((await readCatalog()).revision, state.revision);
});

test("draft cleanup preserves recent uploads and serializes with concurrent publication", async () => {
  const { saveImage, imageExists } = require("../infrastructure/images/files.ts");
  const { pruneExpiredImages } = require("../application/images.ts");
  const bytes = await require("sharp")({ create: { width: 1, height: 1, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  const old = await saveImage({ bytes, ext: "png" });
  const fresh = await saveImage({ bytes, ext: "png" });
  const past = new Date(Date.now() - 25 * 3600_000);
  await fs.utimes(path.join(directory, "images", old), past, past);
  const result = await pruneExpiredImages();
  assert.ok(result.candidates >= 1);
  assert.equal(result.applied, false);
  assert.equal(await imageExists(old), true);
  const state = await readCatalog();
  state.catalog.content.mainMobileImage = "/api/admin/images/" + old;
  const [write, cleanup] = await Promise.allSettled([
    writeCatalog(state.catalog, state.revision),
    pruneExpiredImages(true),
  ]);
  assert.equal(cleanup.status, "fulfilled");
  if (write.status === "fulfilled") {
    assert.equal(await imageExists(old), true);
    assert.equal((await readCatalog()).catalog.content.mainMobileImage, "/api/admin/images/" + old);
  } else {
    assert.equal(write.reason.status, 400);
    assert.equal(await imageExists(old), false);
  }
  assert.equal(await imageExists(fresh), true);
});

test("parallel duplicate orders are one durable order, and conflicting bodies remain conflicts", async () => {
  const fresh = createPrismaClient(url);
  try {
    const session = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        orderService(index % 2 ? fresh : db).createOrder(session, "parallel-db-request", input()),
      ),
    );
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(new Set(results.map((result) => result.order.id)).size, 1);
    assert.equal(await db.order.count(), 1);
    assert.equal(await db.orderStatusHistory.count(), 1);
    await assert.rejects(
      orderService().createOrder(session, "parallel-db-request", input({ address: "다른 주소" })),
      (error) => error.status === 409,
    );
    const order = results[0].order;
    const state = await readCatalog();
    state.catalog.products[0].price = 1;
    await writeCatalog(state.catalog, state.revision);
    const loaded = await orderService(fresh).getOrder(session, order.id);
    assert.equal(loaded.total, order.total);
    assert.equal(loaded.items[0].unitPrice, order.items[0].unitPrice);
  } finally {
    await fresh.$disconnect();
  }
});

test(
  "five concurrent orders complete when every pool connection holds an order transaction",
  { timeout: 15000 },
  async () => {
    const session = await db.session.create({
      data: { tokenHash: hashToken("full-pool-guest"), kind: "guest", expiresAt: new Date("2027-01-01T00:00:00Z") },
    });
    const repository = createPostgresOrdersRepository(db);
    let started = 0;
    let release;
    const allStarted = new Promise((resolve) => {
      release = resolve;
    });
    const service = createOrdersService({
      repository: {
        ...repository,
        transaction: (work) =>
          repository.transaction(async (tx) => {
            if (++started === 5) {
              release();
            }
            await allStarted;
            return work(tx);
          }),
      },
      now,
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => service.createOrder(session.id, "full-pool-" + index, input())),
    );
    assert.equal(started, 5);
    assert.ok(results.every((result) => result.created));
    assert.equal(new Set(results.map((result) => result.order.id)).size, 5);
    assert.equal(await db.order.count(), 5);
  },
);

test("catalog edits wait for the transaction that prices and inserts an order", async () => {
  const repository = createPostgresOrdersRepository(db);
  let release;
  let captured;
  const unlocked = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    captured = resolve;
  });
  const read = repository.transaction(async (tx) => {
    const catalog = await tx.getCatalog();
    captured(catalog.products[0].price);
    await unlocked;
    return catalog.products[0].price;
  });
  const oldPrice = await ready;
  const current = await readCatalog();
  current.catalog.products[0].price = oldPrice + 100;
  let committed = false;
  const write = writeCatalog(current.catalog, current.revision).then((result) => {
    committed = true;
    return result;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(committed, false);
  } finally {
    release();
  }
  assert.equal(await read, oldPrice);
  assert.equal((await write).catalog.products[0].price, oldPrice + 100);
});

test("failed order/history writes roll back, and competing status updates append one history entry", async () => {
  const service = orderService();
  const { order } = await service.createOrder(randomUUID(), "status-db-request", input());
  const raced = await Promise.allSettled([
    service.changeStatus(administrator.id, order.id, { version: 1, status: "confirmed" }),
    service.changeStatus(administrator.id, order.id, { version: 1, status: "confirmed" }),
  ]);
  assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(raced.find((result) => result.status === "rejected").reason.status, 409);
  assert.equal(await db.orderStatusHistory.count(), 2);
  await assert.rejects(service.changeStatus(randomUUID(), order.id, { version: 2, status: "preparing" }));
  const unchanged = await db.order.findUnique({ where: { id: order.id } });
  assert.equal(unchanged.version, 2);
  assert.equal(unchanged.status, "confirmed");
  assert.equal(await db.orderStatusHistory.count(), 2);
  const repository = createPostgresOrdersRepository(db);
  await assert.rejects(
    repository.transaction(async (tx) => {
      const body = {
        customerSessionId: randomUUID(),
        requestKey: "rollback-db-request",
        requestHash: order.requestHash,
        ordererName: order.ordererName,
        phone: order.phone,
        address: order.address,
        addressDetail: order.addressDetail,
        desiredStartAt: order.desiredStartAt,
        desiredEndAt: order.desiredEndAt,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        items: order.items.map(({ productId, productType, name, options, unitPrice, quantity }) => ({
          productId,
          productType,
          name,
          options,
          unitPrice,
          quantity,
        })),
      };
      await tx.create(body);
      throw new Error("force rollback");
    }),
    /force rollback/,
  );
  assert.equal(await db.order.count(), 1);
});

test("persistent sessions use token hashes, enforce the shared limit and revoke disabled administrators", async () => {
  const fresh = createPrismaClient(url);
  try {
    const a = createIdentityService({ repository: createPostgresIdentityRepository(db), maxGuestSessions: 2, now });
    const b = createIdentityService({ repository: createPostgresIdentityRepository(fresh), maxGuestSessions: 2, now });
    const issued = await a.login("integration-admin", "integration-password");
    assert.equal((await b.resolve(issued.token, "admin")).adminUserId, administrator.id);
    assert.equal(
      (await db.session.findUnique({ where: { id: issued.session.id } })).tokenHash,
      hashToken(issued.token),
    );
    const guests = await Promise.allSettled(
      Array.from({ length: 7 }, (_, index) => (index % 2 ? a : b).issueGuestSession()),
    );
    assert.equal(guests.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(await db.session.count({ where: { kind: "guest" } }), 2);
    await db.adminUser.update({ where: { id: administrator.id }, data: { disabled: true } });
    assert.equal(await b.resolve(issued.token, "admin"), null);
    await assert.rejects(a.login("integration-admin", "integration-password"), (error) => error.status === 401);
    await b.logout(issued.token);
    assert.equal(await a.resolve(issued.token, "admin"), null);
  } finally {
    await fresh.$disconnect();
  }
});

test("catalog replacement rolls back every table if a required ingredient cannot be deleted", async () => {
  const original = await readCatalog();
  const ingredient = original.catalog.ingredients[0];
  await db.productIngredient.create({ data: { productId: "salad-0", ingredientId: ingredient.id, position: 0 } });
  const changed = structuredClone(original.catalog);
  changed.products[0].name = "저장되면 안 되는 이름";
  changed.ingredients = changed.ingredients.filter((row) => row.id !== ingredient.id);
  await assert.rejects(writeCatalog(changed, original.revision));
  const current = await readCatalog();
  assert.equal(current.revision, original.revision);
  assert.equal(current.catalog.products[0].name, original.catalog.products[0].name);
  assert.equal(current.catalog.reviews.length, original.catalog.reviews.length);
  assert.equal(current.catalog.groups.length, original.catalog.groups.length);
  assert.ok(current.catalog.ingredients.some((row) => row.id === ingredient.id));
});

test("SQL pagination respects customer and day filters without repeating tied timestamps", async () => {
  const service = orderService();
  const session = randomUUID();
  const own = [];
  for (let index = 0; index < 4; index++) {
    own.push((await service.createOrder(session, `page-db-request-${index}`, input())).order);
  }
  await service.createOrder(randomUUID(), "someone-else-request", input());
  const tiedAt = new Date("2026-10-11T03:00:00Z");
  await db.order.updateMany({ data: { createdAt: tiedAt } });
  const first = await service.listOwnOrders(session, { limit: 2 });
  const second = await service.listOwnOrders(session, { limit: 2, cursor: first.nextCursor });
  assert.equal(first.items.length, 2);
  assert.equal(second.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 4);
  assert.equal(second.nextCursor, null);
  assert.equal((await service.listOrders({ limit: 20, from: "2026-10-11", to: "2026-10-11" })).items.length, 5);
  assert.equal((await service.listOrders({ limit: 20, from: "2026-10-12", to: "2026-10-12" })).items.length, 0);
});

test("sales include completed orders and keep item/option snapshots after product deletion", async () => {
  const service = orderService();
  const { order } = await service.createOrder(randomUUID(), "sales-db-request", input());
  await service.createOrder(randomUUID(), "uncompleted-db-request", input());
  let version = 1;
  for (const status of ["confirmed", "preparing", "delivering", "completed"]) {
    await service.changeStatus(administrator.id, order.id, { version: version++, status });
  }
  let state = await readCatalog();
  state.catalog.products = state.catalog.products.filter((product) => product.id !== "salad-0");
  state.catalog.content.seasonProductId = "";
  await writeCatalog(state.catalog, state.revision);
  state = await readCatalog();
  const sales = await readSalesData(db);
  assert.equal(sales.orders.length, 1);
  assert.equal(sales.orders[0].paidAt, null);
  const report = buildSalesReport(state.catalog, sales, "all", new Date(Date.now() + 1000));
  assert.equal(report.totalQuantity, 2);
  assert.equal(report.rows.find((row) => row.productId === "salad-0").archived, true);
  assert.equal(buildSalesReport(state.catalog, sales, "all", new Date(Date.now() + 1000), "drink").totalQuantity, 2);
  assert.equal(buildSalesReport(state.catalog, sales, "all", new Date(Date.now() + 1000), "dressing").totalQuantity, 2);
  const record = await service.getOrderForAdmin(order.id);
  assert.equal(record.items[0].productId, "salad-0");
});

test("legacy import backs up original bytes, keeps revision/IDs/tombstones and refuses overwrite", async () => {
  await reset();
  const catalog = customerSeed();
  const deleted = catalog.reviews[0].id;
  const raw = Buffer.from(
    JSON.stringify({
      schemaVersion: 4,
      catalog,
      revision: 19,
      updatedAt: now().toISOString(),
      nextCustomerId: 88,
      deletedReviewIds: [deleted],
    }),
  );
  const filename = path.join(directory, "catalog.json");
  await fs.writeFile(filename, raw);
  const result = await importCatalogFile(db, filename);
  assert.equal(result.imported, true);
  assert.deepEqual(await fs.readFile(result.backup), raw);
  assert.equal((await fs.stat(result.backup)).mode & 0o777, 0o600);
  await applyDefaultSql(url);
  assert.equal((await readCatalog()).revision, 19);
  assert.ok(!(await readCatalog()).catalog.reviews.some((review) => review.id === deleted));
  const state = await readCatalog();
  state.catalog.products.push({ ...state.catalog.products[0], id: "after-import", customerId: undefined });
  assert.equal((await writeCatalog(state.catalog, state.revision)).catalog.products.at(-1).customerId, 88);
  assert.equal((await importCatalogFile(db, filename)).imported, false);
  await fs.writeFile(filename, Buffer.from(raw.toString().replace('"revision":19', '"revision":20')));
  await assert.rejects(importCatalogFile(db, filename), /데이터/);
});

test("administrator product PATCH requires a real session and rejects cross-origin writes", async () => {
  const { NextRequest } = require("next/server");
  const { PATCH } = require("../app/api/admin/products/[id]/route.ts");
  setServicesForTests(createServices());
  try {
    const request = (cookie, origin = "http://localhost") =>
      new NextRequest("http://localhost/api/admin/products/0", {
        method: "PATCH",
        headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ price: 19000 }),
      });

    const context = () => ({ params: Promise.resolve({ id: "0" }) });
    assert.equal((await PATCH(request(), context())).status, 401);
    assert.equal((await PATCH(request(undefined, "http://different.example"), context())).status, 403);
    const identity = createIdentityService({ repository: createPostgresIdentityRepository(db) });
    const issued = await identity.login("integration-admin", "integration-password");
    assert.equal((await PATCH(request("lb_admin=" + issued.token), context())).status, 200);
    const oversized = new NextRequest("http://localhost/api/admin/products/0", {
      method: "PATCH",
      headers: { cookie: "lb_admin=" + issued.token, origin: "http://localhost" },
      body: " ".repeat(20_000),
    });
    assert.equal((await PATCH(oversized, context())).status, 413);
    assert.equal((await findProductById(0)).price, 19000);
  } finally {
    setServicesForTests(undefined);
  }
});

test("DB catalog configuration drives recommendation, categories and editor choices and survives reinitialization", async () => {
  const state = await readCatalog();
  const config = structuredClone(state.defaults.catalogConfig);
  config.bowlRecommendations.chicken = 5;
  config.categoryAliases["든든한 단백질"] = "other";
  config.allergenOrder = ["DB 알레르기"];
  config.originCountries = ["DB 원산지"];
  config.deliveryRequestPresets = ["DB 배송 요청"];
  await db.appSetting.update({ where: { key: "catalog_config" }, data: { value: config } });
  const updated = await readCatalog();
  const customer = customerCatalog(updated);
  assert.equal(matchProduct("chicken", customer.catalogConfig.bowlRecommendations), 5);
  assert.equal(customer.getProduct(0).category, "other");
  assert.deepEqual(customer.catalogConfig.allergenOrder, ["DB 알레르기"]);
  assert.deepEqual(updated.defaults.catalogConfig.originCountries, ["DB 원산지"]);
  await db.$executeRawUnsafe(
    await fs.readFile(path.join(__dirname, "../prisma/migrations/0005_catalog_config/migration.sql"), "utf8"),
  );
  await applyDefaultSql(url);
  assert.deepEqual((await readCatalog()).defaults.catalogConfig, config);
});

test("missing or invalid DB configuration fails explicitly and catalog writes roll back", async () => {
  const state = await readCatalog();
  await db.appSetting.update({
    where: { key: "catalog_config" },
    data: { value: { ...state.defaults.catalogConfig, allergenOrder: [] } },
  });
  await assert.rejects(readCatalog());
  const changed = structuredClone(state.catalog);
  changed.products[0].price += 100;
  await assert.rejects(writeCatalog(changed, state.revision));
  assert.equal((await db.catalogMeta.findUniqueOrThrow({ where: { id: 1 } })).revision, state.revision);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: "salad-0" } })).price,
    state.catalog.products[0].price,
  );
  await db.appSetting.delete({ where: { key: "catalog_config" } });
  await assert.rejects(readCatalog(), /설정이 없습니다/);
});

test("catalog persistence never restores removed ingredients or reviews from a static fixture", async () => {
  const state = await readCatalog();
  const empty = { ...state.catalog, ingredients: [], reviews: [] };
  const saved = await writeCatalog(empty, state.revision);
  assert.deepEqual(saved.catalog.ingredients, []);
  assert.deepEqual(saved.catalog.reviews, []);
  const next = structuredClone(saved.catalog);
  delete next.ingredients;
  delete next.reviews;
  next.products[0].en = "";
  await writeCatalog(next, saved.revision);
  const read = await readCatalog();
  assert.deepEqual(read.catalog.ingredients, []);
  assert.deepEqual(read.catalog.reviews, []);
  assert.equal(read.catalog.products[0].en, "");
  assert.equal(await db.ingredient.count(), 0);
  assert.equal(await db.review.count(), 0);
});

function testPayments(database = db, overrides = {}) {
  const approved = new Map();
  let approvals = 0;
  const gateway = {
    assertConfigured() {},
    async lookup(id, paymentKey) {
      const payment = approved.get(id) ?? null;
      return payment?.paymentKey === paymentKey ? payment : null;
    },
    async confirm(paymentKey, orderId, amount) {
      if (!approved.has(orderId)) {
        approvals++;
        approved.set(orderId, {
          paymentKey,
          orderId,
          totalAmount: amount,
          currency: "KRW",
          status: "DONE",
          method: "카드",
          approvedAt: now().toISOString(),
        });
      }
      return approved.get(orderId);
    },
    ...overrides,
  };
  const repository = createPostgresPaymentsRepository(database);
  return {
    service: createPaymentsService({ repository, gateway, now }),
    repository,
    gateway,
    approved,
    count: () => approvals,
  };
}

test("Toss prepares immutable server-priced drafts without creating unpaid orders", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const drafts = await Promise.all(
    Array.from({ length: 5 }, () => payments.service.prepare(session, "toss-draft-001", input())),
  );
  assert.equal(new Set(drafts.map((draft) => draft.orderId)).size, 1);
  assert.equal(await db.paymentCheckout.count(), 1);
  assert.equal(await db.order.count(), 0);
  const draft = drafts[0];
  assert.equal(draft.amount, 32800);
  const stored = await db.paymentCheckout.findUnique({ where: { id: draft.orderId } });
  assert.equal(stored.orderSnapshot.total, "32800");
  assert.equal(stored.paymentKey, null);
  await assert.rejects(
    payments.service.prepare(session, "toss-draft-001", input({ address: "다른 주소" })),
    (error) => error.status === 409,
  );
  assert.equal((await payments.service.prepare(randomUUID(), "toss-draft-001", input())).amount, draft.amount);
});

test("Toss concurrent approvals and retries across fresh DB clients create exactly one paid order", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const draft = await payments.service.prepare(session, "toss-pay-001", input());
  const approval = { orderId: draft.orderId, paymentKey: "toss_test_key", amount: draft.amount };
  const results = await Promise.all(Array.from({ length: 5 }, () => payments.service.confirm(session, approval)));
  assert.equal(new Set(results.map((order) => order.id)).size, 1);
  assert.equal(await db.order.count(), 1);
  assert.equal(await db.orderStatusHistory.count(), 1);
  assert.equal(payments.count(), 1);
  const row = await db.paymentCheckout.findUnique({ where: { id: draft.orderId } });
  assert.equal(row.orderId, results[0].id);
  assert.equal(row.paymentKey, "toss_test_key");
  assert.equal(row.method, "카드");
  const fresh = createPrismaClient(url);
  try {
    const restarted = createPaymentsService({
      repository: createPostgresPaymentsRepository(fresh),
      gateway: {
        ...payments.gateway,
        lookup() {
          throw Error("Paid retries must not call the provider");
        },
      },
      now,
    });
    assert.equal((await restarted.confirm(session, approval)).id, results[0].id);
  } finally {
    await fresh.$disconnect();
  }
  await assert.rejects(
    orderService().cancelOrder(session, results[0].id),
    (error) => error.status === 409 && /환불/.test(error.message),
  );
  assert.equal((await db.order.findUnique({ where: { id: results[0].id } })).status, "received");
});

test("Toss rejects foreign sessions, tampered amounts, a second payment key and expired drafts before contacting the provider", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const draft = await payments.service.prepare(session, "toss-guard-001", input());
  const approval = { orderId: draft.orderId, paymentKey: "toss_test_key", amount: draft.amount };
  await assert.rejects(payments.service.confirm(randomUUID(), approval), (error) => error.status === 404);
  await assert.rejects(payments.service.confirm(session, { ...approval, amount: 1 }), (error) => error.status === 400);
  assert.equal(payments.count(), 0);
  assert.equal((await db.paymentCheckout.findUnique({ where: { id: draft.orderId } })).paymentKey, null);
  await db.paymentCheckout.update({ where: { id: draft.orderId }, data: { expiresAt: new Date(now().getTime() - 1) } });
  await assert.rejects(payments.service.confirm(session, approval), (error) => error.status === 409);
  assert.equal(payments.count(), 0);
  await db.paymentCheckout.update({
    where: { id: draft.orderId },
    data: { expiresAt: new Date(now().getTime() + 60000) },
  });
  await payments.repository.bindPaymentKey(draft.orderId, approval.paymentKey, now());
  await assert.rejects(
    payments.service.confirm(session, { ...approval, paymentKey: "other_key" }),
    (error) => error.status === 409,
  );
  assert.equal(payments.count(), 0);
});

test("Toss approval response loss is recovered by lookup, and a changed catalog cannot change the charged snapshot", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const draft = await payments.service.prepare(session, "toss-recover-001", input());
  const original = payments.gateway.confirm;
  payments.gateway.confirm = async (...args) => {
    await original(...args);
    throw Error("provider response lost");
  };
  await db.product.update({ where: { id: "salad-0" }, data: { price: 19900, name: "변경된 상품명" } });
  const order = await payments.service.confirm(session, {
    orderId: draft.orderId,
    paymentKey: "toss_recovery_key",
    amount: draft.amount,
  });
  assert.equal(order.total, 32800n);
  assert.equal(order.items[0].name, "레몬 치킨 아보카도");
  assert.equal(order.items[0].unitPrice, 14900n);
  assert.equal(payments.count(), 1);
});

test("Toss approval survives a real DB transaction rollback and is reconciled without another charge", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const draft = await payments.service.prepare(session, "toss-rollback-001", input());
  const approval = { orderId: draft.orderId, paymentKey: "toss_rollback_key", amount: draft.amount };
  await db.$executeRawUnsafe(
    "CREATE FUNCTION toss_test_fail_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test order rollback'; END $$",
  );
  await db.$executeRawUnsafe(
    "CREATE TRIGGER toss_test_fail_order BEFORE INSERT ON order_status_history FOR EACH ROW EXECUTE FUNCTION toss_test_fail_order()",
  );
  try {
    await assert.rejects(payments.service.confirm(session, approval));
    assert.equal(await db.order.count(), 0);
    assert.equal((await db.paymentCheckout.findUnique({ where: { id: draft.orderId } })).orderId, null);
    assert.equal(payments.count(), 1);
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER toss_test_fail_order ON order_status_history");
    await db.$executeRawUnsafe("DROP FUNCTION toss_test_fail_order()");
  }
  // Recovery still works after the local draft expiry because authentication was already bound.
  await db.paymentCheckout.update({ where: { id: draft.orderId }, data: { expiresAt: new Date(now().getTime() - 1) } });
  assert.ok((await payments.service.confirm(session, approval)).id);
  assert.equal(await db.order.count(), 1);
  assert.equal(payments.count(), 1);
});

test("Toss approval preserves the quoted product identity even after catalog deletion", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const draft = await payments.service.prepare(session, "toss-deletion-001", input());
  await db.product.delete({ where: { id: "salad-0" } });
  const order = await payments.service.confirm(session, {
    orderId: draft.orderId,
    paymentKey: "deleted_product_key",
    amount: draft.amount,
  });
  assert.equal(order.items[0].name, "레몬 치킨 아보카도");
  assert.equal(order.items[0].unitPrice, 14900n);
  const line = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  assert.equal(line.productId, null);
  assert.equal(line.originalProductId, "salad-0");
});

test("Toss rejects a failed provider confirmation and mismatching provider data without receiving an order", async () => {
  const session = randomUUID();
  const payments = testPayments(db, {
    async confirm() {
      throw Error("provider rejected");
    },
  });
  const draft = await payments.service.prepare(session, "toss-decline-001", input());
  const approval = { orderId: draft.orderId, paymentKey: "toss_declined_key", amount: draft.amount };
  await assert.rejects(payments.service.confirm(session, approval), /provider rejected/);
  assert.equal(await db.order.count(), 0);
  payments.approved.set(draft.orderId, {
    ...approval,
    totalAmount: 1,
    currency: "KRW",
    status: "DONE",
    method: "카드",
    approvedAt: now().toISOString(),
  });
  await assert.rejects(payments.service.confirm(session, approval), (error) => error.status === 409);
  assert.equal(await db.order.count(), 0);
});

test("expired unbound drafts renew once, while uncertain approvals retain the same payment", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const key = "toss-expiry-001";
  const old = await payments.service.prepare(session, key, input());
  await db.paymentCheckout.update({ where: { id: old.orderId }, data: { expiresAt: new Date(now().getTime() - 1) } });
  const renewals = await Promise.all(Array.from({ length: 5 }, () => payments.service.prepare(session, key, input())));
  assert.equal(new Set(renewals.map((draft) => draft.orderId)).size, 1);
  assert.notEqual(renewals[0].orderId, old.orderId);
  await assert.rejects(
    payments.service.confirm(session, { orderId: old.orderId, paymentKey: "expired_key", amount: old.amount }),
    (error) => error.status === 409,
  );
  const renewed = renewals[0];
  await payments.repository.bindPaymentKey(renewed.orderId, "uncertain_key", now());
  await db.paymentCheckout.update({
    where: { id: renewed.orderId },
    data: { expiresAt: new Date(now().getTime() - 1) },
  });
  const uncertain = await payments.service.prepare(session, key, input());
  assert.equal(uncertain.orderId, renewed.orderId);
  assert.equal(uncertain.paymentKey, "uncertain_key");
  assert.equal(await db.order.count(), 0);
  assert.equal(payments.count(), 0);
});

test("only verified terminal provider failures allow another payment attempt", async () => {
  const session = randomUUID();
  const payments = testPayments();
  const key = "toss-terminal-001";
  const old = await payments.service.prepare(session, key, input());
  await payments.repository.bindPaymentKey(old.orderId, "declined_key", now());
  const terminal = {
    orderId: old.orderId,
    paymentKey: "declined_key",
    totalAmount: old.amount,
    currency: "KRW",
    status: "ABORTED",
    method: "카드",
    approvedAt: null,
  };
  payments.approved.set(old.orderId, { ...terminal, paymentKey: "foreign_key" });
  assert.equal((await payments.service.prepare(session, key, input())).orderId, old.orderId);
  payments.approved.set(old.orderId, terminal);
  const replacement = await payments.service.prepare(session, key, input());
  assert.notEqual(replacement.orderId, old.orderId);
  await assert.rejects(
    payments.service.confirm(session, { orderId: old.orderId, paymentKey: "declined_key", amount: old.amount }),
    (error) => error.status === 409,
  );
  const order = await payments.service.confirm(session, {
    orderId: replacement.orderId,
    paymentKey: "replacement_key",
    amount: replacement.amount,
  });
  assert.ok(order.id);
  assert.equal(await db.order.count(), 1);
  assert.equal(payments.count(), 1);
});
