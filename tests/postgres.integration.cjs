/* eslint-disable @typescript-eslint/no-require-imports */
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createPrismaClient, prisma, databaseTransaction } = require('../lib/prisma.ts');
const { customerSeed } = require('../lib/admin/customer-seed.ts');
const { lockCatalog, readCatalogState } = require('../lib/admin/postgres-catalog.ts');
const { readCatalog, writeCatalog, appendCustomerReview } = require('../lib/admin/store.ts');
const { importCatalogFile } = require('../lib/admin/import-catalog.ts');
const { createPostgresOrdersRepository } = require('../modules/orders/postgres-repository.ts');
const { createOrdersService } = require('../modules/orders/service.ts');
const { createOrderSchema } = require('../modules/orders/schema.ts');
const { createPostgresIdentityRepository } = require('../modules/identity/postgres-repository.ts');
const { createIdentityService } = require('../modules/identity/service.ts');
const { hashPassword, hashToken } = require('../modules/identity/crypto.ts');
const { readSalesData } = require('../lib/admin/sales-store.ts');
const { buildSalesReport } = require('../lib/admin/sales.ts');
const { updateProduct, findProductById } = require('../lib/products-repository.ts');
const { createServices, setServicesForTests } = require('../modules/container.ts');
const { applyDefaultSql } = require('../lib/admin/sql-seed.ts');
const { customerCatalog } = require('../lib/customer/catalog.ts');
const { getDeliveryHours } = require('../lib/data/server.ts');

const url = process.env.DATABASE_URL;
const name = decodeURIComponent(new URL(url).pathname.slice(1));
assert.match(name, /(?:^|[_-])test$/, 'Refusing to modify a non-test database');
const db = prisma();
const now = () => new Date('2026-10-11T03:00:00Z');
let administrator;
let directory;

async function reset() {
  const [{ name: actualName }] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(actualName, name, 'Test connection must resolve to the guarded database');
  await db.$executeRawUnsafe('TRUNCATE app_settings, catalog_meta, catalog_imports, deleted_review_ids, products, ingredients, option_groups, allergens, categories, reviews, site_content, season_pages, store_location, orders, admin_users, sessions RESTART IDENTITY CASCADE');
}
function orderService(database = db) {
  return createOrdersService({ repository: createPostgresOrdersRepository(database), getCatalog: async () => (await readCatalog()).catalog, getHours: getDeliveryHours, now });
}
function input(extra = {}) {
  return createOrderSchema.parse({
    ordererName: 'DB 테스트', phone: '010-1234-5678', address: '서울 중구 세종대로 110',
    desiredStartAt: '2026-10-13T03:00:00.000Z', desiredEndAt: '2026-10-13T04:00:00.000Z',
    items: [{ productId: 0, dressingKey: 'dressing-0', drinkKeys: ['drink-1'], quantity: 2 }], ...extra,
  });
}
before(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-bowl-postgres-')); process.env.ADMIN_DATA_DIR = directory; await reset(); });
beforeEach(async () => {
  await reset();
  await applyDefaultSql(url);
  administrator = await db.adminUser.create({ data: { loginId: 'integration-admin', passwordHash: await hashPassword('integration-password') } });
});
after(async () => { await reset(); await db.$disconnect(); await fs.rm(directory, { recursive: true, force: true }); });

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

test('a product price edit preserves every unrelated catalog row and product timestamp', async () => {
  const state = await readCatalog();
  const before = await catalogVersions();
  const timestamps = await db.product.findMany({ orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } });
  const product = state.catalog.products[0];
  product.price += 100;
  const result = await writeCatalog(state.catalog, state.revision);
  assert.equal(result.revision, state.revision + 1);
  const after = await catalogVersions();
  assert.deepEqual(after.filter(row => row.key !== 'product:' + product.id), before.filter(row => row.key !== 'product:' + product.id));
  const unchanged = await db.product.findMany({ where: { id: { not: product.id } }, orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } });
  assert.deepEqual(unchanged, timestamps.filter(row => row.id !== product.id));
});

test('review insertion and retry preserve all existing rows, including review photos and drinks', async () => {
  const state = await readCatalog();
  state.catalog.reviews[0].images = ['/images/hero-cutout.png'];
  state.catalog.reviews[0].drinks = ['오렌지 주스'];
  await writeCatalog(state.catalog, state.revision);
  const before = await catalogVersions();
  const input = { id: 'review-preserved', pid: 0, author: '테스트', stars: 5, title: '리뷰 제목', text: '충분히 긴 리뷰 본문입니다.', via: 'delivery', images: ['/images/hero-cutout.png'] };
  const first = await appendCustomerReview(input);
  const after = await catalogVersions();
  for (const row of before) assert.deepEqual(after.find(next => next.key === row.key), row, row.key);
  assert.equal((await readCatalog()).catalog.reviews[0].id, input.id);
  assert.equal((await appendCustomerReview(input)).revision, first.revision);
  assert.deepEqual(await catalogVersions(), after);
  const edit = await readCatalog();
  edit.catalog.products[0].price += 100;
  await writeCatalog(edit.catalog, edit.revision);
  assert.deepEqual((await catalogVersions()).filter(row => row.key.startsWith('review:') || row.key.startsWith('image:') || row.key.startsWith('drink:')), after.filter(row => row.key.startsWith('review:') || row.key.startsWith('image:') || row.key.startsWith('drink:')));
});

test('partial persistence handles option changes, allergen links, review removal and reordering', async () => {
  const state = await readCatalog();
  const removedReview = state.catalog.reviews[0];
  state.catalog.reviews = state.catalog.reviews.slice(1).reverse();
  state.catalog.groups.push({ id: 'extra-test', name: '테스트 옵션', source: 'custom', required: false, multiple: true, deleted: false, choices: [{ id: 'one', name: '첫 선택', price: 100 }, { id: 'two', name: '두 번째', price: 200 }] });
  state.catalog.products[0].optionIds.push('extra-test');
  state.catalog.products[0].allergens = '우유 · 대두';
  state.catalog.ingredients[0].allergens = '우유';
  state.catalog.content.heroTitle = '수정 제목';
  const result = await writeCatalog(state.catalog, state.revision);
  assert.deepEqual((await readCatalog()).catalog, result.catalog);
  assert.equal(await db.review.count({ where: { id: removedReview.id } }), 0);
  assert.ok(await db.deletedReviewId.findUnique({ where: { id: removedReview.id } }));
  const links = await db.productAllergen.findMany({ where: { productId: state.catalog.products[0].id }, include: { allergen: true }, orderBy: { position: 'asc' } });
  assert.deepEqual(links.map(row => row.allergen.name), ['우유', '대두']);
  const edit = await readCatalog();
  edit.catalog.groups.at(-1).choices.reverse();
  edit.catalog.groups.at(-1).choices[0].price += 100;
  edit.catalog.products[0].optionIds = edit.catalog.products[0].optionIds.filter(id => id !== 'extra-test');
  edit.catalog.groups.at(-1).deleted = true;
  const saved = await writeCatalog(edit.catalog, edit.revision);
  assert.deepEqual((await readCatalog()).catalog, saved.catalog);
});

test('standalone SQL initializes every current default field and application setting', async () => {
  const state = await readCatalog();
  const expected = customerSeed();
  const json = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(json(state.catalog.products), json(expected.products));
  assert.deepEqual(json(state.catalog.ingredients), json(expected.ingredients));
  assert.deepEqual(json(state.catalog.groups), json(expected.groups));
  assert.deepEqual(json(state.catalog.content), json(expected.content));
  assert.deepEqual(json(state.catalog.reviews), json(expected.reviews.map(review => ({ ...review, images: [], drinks: [] }))));
  assert.equal(state.revision, 1);
  assert.equal((await db.catalogMeta.findUnique({ where: { id: 1 } })).nextCustomerId, 12);
  assert.deepEqual(state.defaults.heroSlides, require('../lib/data/hero.ts').HERO_SLIDES);
  assert.deepEqual(Object.values(state.defaults.nutrition), require('../lib/products.ts').NUTRITION);
  assert.deepEqual(state.defaults.pricingPolicy, require('../lib/pricing-policy.ts').REFERENCE_PRICING_POLICY);
  assert.deepEqual(await getDeliveryHours(), { days: '매일', open: 10, close: 21 });
  const customer = customerCatalog(state);
  assert.equal(customer.heroSlides.length, 3);
  assert.equal(customer.kcalOf(0, 0, [1]), customer.NUTRITION[0].kcal + 120 + 110);
  assert.equal(await db.order.count(), 0);
  assert.equal(await db.session.count(), 0);
});

test('SQL reruns preserve catalog edits, settings, orders and deletion history', async () => {
  const session = await db.session.create({ data: { tokenHash: hashToken('sql-seed-guest'), kind: 'guest', expiresAt: new Date('2027-01-01T00:00:00Z') } });
  const { order } = await orderService().createOrder(session.id, 'sql-seed-original-order', input());
  const state = await readCatalog();
  state.catalog.products[0].price += 1000;
  state.catalog.reviews = state.catalog.reviews.slice(1);
  await writeCatalog(state.catalog, state.revision);
  await db.appSetting.update({ where: { key: 'delivery_hours' }, data: { value: { days: '평일', open: 9, close: 22 }, updatedAt: now() } });
  const before = await readCatalog();
  const removed = await db.deletedReviewId.findMany();
  await Promise.all([applyDefaultSql(url), applyDefaultSql(url)]);
  assert.deepEqual(await readCatalog(), before);
  assert.deepEqual(await db.deletedReviewId.findMany(), removed);
  assert.equal(await db.order.count(), 1);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).total, order.total);
  assert.equal(await db.adminUser.count(), 1);
});

test('failed SQL initialization rolls back settings and all inserted catalog rows', async () => {
  await reset();
  const filename = path.join(directory, 'failing-seed.sql');
  const sql = await fs.readFile(path.join(__dirname, '../db/seed.sql'), 'utf8');
  assert.match(sql, /INSERT INTO catalog_meta/);
  await fs.writeFile(filename, sql.replace('INSERT INTO catalog_meta', "RAISE EXCEPTION 'forced-seed-failure';\n  INSERT INTO catalog_meta"));
  await assert.rejects(applyDefaultSql(url, filename), /forced-seed-failure/);
  for (const model of ['appSetting', 'product', 'ingredient', 'review', 'category', 'allergen', 'catalogMeta', 'siteContent']) assert.equal(await db[model].count(), 0);
  // An incomplete pre-existing catalog is reported without modifying it.
  const product = customerSeed().products[0];
  await db.product.create({ data: { id: product.id, type: product.type, name: product.name, price: product.price, category: product.category, sortOrder: 0 } });
  await assert.rejects(applyDefaultSql(url), /메타데이터 없는 기존 앱 데이터/);
  assert.equal(await db.product.count(), 1);
  assert.equal(await db.appSetting.count(), 0);
});

test('database policy and hours drive both customer totals and order validation', async () => {
  const settings = { deliveryFee: 700, minDeliveryOrder: 1000, freeDeliveryFrom: 99999, baseBowlPrice: 9000 };
  await db.appSetting.update({ where: { key: 'pricing_policy' }, data: { value: settings, updatedAt: now() } });
  const state = await readCatalog();
  const customer = customerCatalog(state);
  const custom = { kind: 'custom', ingredientIds: ['romaine', 'chicken'], ingredients: [], name: 'SQL 볼', allergens: [], dressing: 0, dressingKey: 'dressing-0', price: 0, photo: 0, qty: 2 };
  assert.equal(customer.itemUnitPrice(custom), 11000);
  assert.equal(customer.deliveryFee(22000), 700);
  const session = await db.session.create({ data: { tokenHash: hashToken('sql-policy-guest'), kind: 'guest', expiresAt: new Date('2027-01-01T00:00:00Z') } });
  const { order } = await orderService().createOrder(session.id, 'sql-policy-order', input({ items: [{ ingredientKeys: ['romaine', 'chicken'], dressingKey: 'dressing-0', quantity: 2 }] }));
  assert.equal(order.subtotal, 22000n); assert.equal(order.deliveryFee, 700n); assert.equal(order.total, 22700n);
  await db.appSetting.update({ where: { key: 'delivery_hours' }, data: { value: { days: '매일', open: 14, close: 21 }, updatedAt: now() } });
  await assert.rejects(orderService().createOrder(session.id, 'outside-db-hours', input()), error => error.status === 400);
  assert.equal(await db.order.count(), 1);
});

test('catalog revisions, optional fields, stable IDs and review deletion survive a fresh client', async () => {
  let state = await readCatalog();
  state.catalog.location = { name: '매장', address: '서울', detailAddress: '1층' };
  state.catalog.ingredients[0].origin = '국내산';
  state.catalog.ingredients[0].originDetail = '제주';
  state.catalog.content.seasonPages = [];
  state.catalog.products[0].price = 16000;
  state.catalog.products.push({ ...state.catalog.products[0], id: 'new-salad', customerId: undefined });
  const saved = await writeCatalog(state.catalog, state.revision);
  assert.equal(saved.catalog.products.at(-1).customerId, 12);
  assert.equal(await writeCatalog(state.catalog, state.revision), null);
  const results = await Promise.all([writeCatalog(saved.catalog, saved.revision), writeCatalog(saved.catalog, saved.revision)]);
  assert.equal(results.filter(Boolean).length, 1);
  const review = { id: 'customer-db-review', pid: 0, author: '고객', stars: 5, title: '리뷰', text: '실제 DB에 보존되는 리뷰입니다.', via: 'delivery', images: ['/api/admin/images/test.png'] };
  state = await appendCustomerReview(review);
  const revision = state.revision;
  assert.equal((await appendCustomerReview(review)).revision, revision);
  state.catalog.reviews = state.catalog.reviews.filter(row => row.id !== review.id);
  state = await writeCatalog(state.catalog, state.revision);
  assert.equal((await appendCustomerReview(review)).revision, state.revision);
  const fresh = createPrismaClient(url);
  try {
    const actual = await databaseTransaction(fresh, async tx => { await lockCatalog(tx, 'read'); return readCatalogState(tx); });
    assert.equal(actual.catalog.products[0].price, 16000);
    assert.equal(actual.catalog.products.at(-1).customerId, 12);
    assert.equal(actual.nextCustomerId, 13);
    assert.equal(actual.catalog.ingredients[0].originDetail, '제주');
    assert.deepEqual(actual.catalog.location, state.catalog.location);
    assert.deepEqual(actual.catalog.content.seasonPages, []);
    assert.ok(actual.deletedReviewIds.includes(review.id));
    assert.ok(!actual.catalog.reviews.some(row => row.id === review.id));
    assert.equal((await findProductById(0)).price, 16000);
    await updateProduct(0, { price: 17000, isNew: true, isOnSale: false, tag: undefined });
    const product = (await readCatalog()).catalog.products[0];
    assert.equal(product.price, 17000); assert.equal(product.status, 'soldout');
    assert.equal(product.isNew, true); assert.equal(product.badge, '');
  } finally { await fresh.$disconnect(); }
});

test('parallel duplicate orders are one durable order, and conflicting bodies remain conflicts', async () => {
  const fresh = createPrismaClient(url);
  try {
    const session = randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => orderService(index % 2 ? fresh : db).createOrder(session, 'parallel-db-request', input())));
    assert.equal(results.filter(result => result.created).length, 1);
    assert.equal(new Set(results.map(result => result.order.id)).size, 1);
    assert.equal(await db.order.count(), 1);
    assert.equal(await db.orderStatusHistory.count(), 1);
    await assert.rejects(orderService().createOrder(session, 'parallel-db-request', input({ address: '다른 주소' })), error => error.status === 409);
    const order = results[0].order;
    const state = await readCatalog();
    state.catalog.products[0].price = 1;
    await writeCatalog(state.catalog, state.revision);
    const loaded = await orderService(fresh).getOrder(session, order.id);
    assert.equal(loaded.total, order.total);
    assert.equal(loaded.items[0].unitPrice, order.items[0].unitPrice);
  } finally { await fresh.$disconnect(); }
});

test('catalog edits wait for the transaction that prices and inserts an order', async () => {
  const repository = createPostgresOrdersRepository(db);
  let release;
  let captured;
  const unlocked = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { captured = resolve; });
  const read = repository.transaction(async tx => {
    const catalog = await tx.getCatalog(); captured(catalog.products[0].price); await unlocked;
    return catalog.products[0].price;
  });
  const oldPrice = await ready;
  const current = await readCatalog();
  current.catalog.products[0].price = oldPrice + 100;
  let committed = false;
  const write = writeCatalog(current.catalog, current.revision).then(result => { committed = true; return result; });
  try { await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(committed, false); }
  finally { release(); }
  assert.equal(await read, oldPrice);
  assert.equal((await write).catalog.products[0].price, oldPrice + 100);
});

test('failed order/history writes roll back, and competing status updates append one history entry', async () => {
  const service = orderService();
  const { order } = await service.createOrder(randomUUID(), 'status-db-request', input());
  const raced = await Promise.allSettled([service.changeStatus(administrator.id, order.id, { version: 1, status: 'confirmed' }), service.changeStatus(administrator.id, order.id, { version: 1, status: 'confirmed' })]);
  assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(raced.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(await db.orderStatusHistory.count(), 2);
  await assert.rejects(service.changeStatus(randomUUID(), order.id, { version: 2, status: 'preparing' }));
  const unchanged = await db.order.findUnique({ where: { id: order.id } });
  assert.equal(unchanged.version, 2); assert.equal(unchanged.status, 'confirmed');
  assert.equal(await db.orderStatusHistory.count(), 2);
  const repository = createPostgresOrdersRepository(db);
  await assert.rejects(repository.transaction(async tx => {
    const body = {
      customerSessionId: randomUUID(), requestKey: 'rollback-db-request', requestHash: order.requestHash,
      ordererName: order.ordererName, phone: order.phone, address: order.address, addressDetail: order.addressDetail,
      desiredStartAt: order.desiredStartAt, desiredEndAt: order.desiredEndAt,
      subtotal: order.subtotal, deliveryFee: order.deliveryFee, total: order.total, items: order.items,
    };
    await tx.create(body);
    throw new Error('force rollback');
  }), /force rollback/);
  assert.equal(await db.order.count(), 1);
});

test('persistent sessions use token hashes, enforce the shared limit and revoke disabled administrators', async () => {
  const fresh = createPrismaClient(url);
  try {
    const a = createIdentityService({ repository: createPostgresIdentityRepository(db), maxGuestSessions: 2, now });
    const b = createIdentityService({ repository: createPostgresIdentityRepository(fresh), maxGuestSessions: 2, now });
    const issued = await a.login('integration-admin', 'integration-password');
    assert.equal((await b.resolve(issued.token, 'admin')).adminUserId, administrator.id);
    assert.equal((await db.session.findUnique({ where: { id: issued.session.id } })).tokenHash, hashToken(issued.token));
    const guests = await Promise.allSettled(Array.from({ length: 7 }, (_, index) => (index % 2 ? a : b).issueGuestSession()));
    assert.equal(guests.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(await db.session.count({ where: { kind: 'guest' } }), 2);
    await db.adminUser.update({ where: { id: administrator.id }, data: { disabled: true } });
    assert.equal(await b.resolve(issued.token, 'admin'), null);
    await assert.rejects(a.login('integration-admin', 'integration-password'), error => error.status === 401);
    await b.logout(issued.token);
    assert.equal(await a.resolve(issued.token, 'admin'), null);
  } finally { await fresh.$disconnect(); }
});

test('catalog replacement rolls back every table if a required ingredient cannot be deleted', async () => {
  const original = await readCatalog();
  const ingredient = original.catalog.ingredients[0];
  await db.productIngredient.create({ data: { productId: 'salad-0', ingredientId: ingredient.id, position: 0 } });
  const changed = structuredClone(original.catalog);
  changed.products[0].name = '저장되면 안 되는 이름';
  changed.ingredients = changed.ingredients.filter(row => row.id !== ingredient.id);
  await assert.rejects(writeCatalog(changed, original.revision));
  const current = await readCatalog();
  assert.equal(current.revision, original.revision);
  assert.equal(current.catalog.products[0].name, original.catalog.products[0].name);
  assert.equal(current.catalog.reviews.length, original.catalog.reviews.length);
  assert.equal(current.catalog.groups.length, original.catalog.groups.length);
  assert.ok(current.catalog.ingredients.some(row => row.id === ingredient.id));
});

test('SQL pagination respects customer and day filters without repeating tied timestamps', async () => {
  const service = orderService();
  const session = randomUUID();
  const own = [];
  for (let index = 0; index < 4; index++) own.push((await service.createOrder(session, `page-db-request-${index}`, input())).order);
  await service.createOrder(randomUUID(), 'someone-else-request', input());
  const tiedAt = new Date('2026-10-11T03:00:00Z');
  await db.order.updateMany({ data: { createdAt: tiedAt } });
  const first = await service.listOwnOrders(session, { limit: 2 });
  const second = await service.listOwnOrders(session, { limit: 2, cursor: first.nextCursor });
  assert.equal(first.items.length, 2); assert.equal(second.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 4);
  assert.equal(second.nextCursor, null);
  assert.equal((await service.listOrders({ limit: 20, from: '2026-10-11', to: '2026-10-11' })).items.length, 5);
  assert.equal((await service.listOrders({ limit: 20, from: '2026-10-12', to: '2026-10-12' })).items.length, 0);
});

test('sales include completed orders and keep item/option snapshots after product deletion', async () => {
  const service = orderService();
  const { order } = await service.createOrder(randomUUID(), 'sales-db-request', input());
  await service.createOrder(randomUUID(), 'uncompleted-db-request', input());
  let version = 1;
  for (const status of ['confirmed', 'preparing', 'delivering', 'completed']) await service.changeStatus(administrator.id, order.id, { version: version++, status });
  let state = await readCatalog();
  state.catalog.products = state.catalog.products.filter(product => product.id !== 'salad-0');
  state.catalog.content.seasonProductId = '';
  await writeCatalog(state.catalog, state.revision);
  state = await readCatalog();
  const sales = await readSalesData(db);
  assert.equal(sales.orders.length, 1); assert.equal(sales.orders[0].paidAt, null);
  const report = buildSalesReport(state.catalog, sales, 'all', new Date(Date.now() + 1000));
  assert.equal(report.totalQuantity, 2);
  assert.equal(report.rows.find(row => row.productId === 'salad-0').archived, true);
  assert.equal(buildSalesReport(state.catalog, sales, 'all', new Date(Date.now() + 1000), 'drink').totalQuantity, 2);
  assert.equal(buildSalesReport(state.catalog, sales, 'all', new Date(Date.now() + 1000), 'dressing').totalQuantity, 2);
  const record = await service.getOrderForAdmin(order.id);
  assert.equal(record.items[0].productId, 'salad-0');
});

test('legacy import backs up original bytes, keeps revision/IDs/tombstones and refuses overwrite', async () => {
  await reset();
  const catalog = customerSeed();
  const deleted = catalog.reviews[0].id;
  const raw = Buffer.from(JSON.stringify({ schemaVersion: 4, catalog, revision: 19, updatedAt: now().toISOString(), nextCustomerId: 88, deletedReviewIds: [deleted] }));
  const filename = path.join(directory, 'catalog.json'); await fs.writeFile(filename, raw);
  const result = await importCatalogFile(db, filename);
  assert.equal(result.imported, true); assert.deepEqual(await fs.readFile(result.backup), raw);
  assert.equal((await fs.stat(result.backup)).mode & 0o777, 0o600);
  await applyDefaultSql(url);
  assert.equal((await readCatalog()).revision, 19);
  assert.ok(!(await readCatalog()).catalog.reviews.some(review => review.id === deleted));
  const state = await readCatalog(); state.catalog.products.push({ ...state.catalog.products[0], id: 'after-import', customerId: undefined });
  assert.equal((await writeCatalog(state.catalog, state.revision)).catalog.products.at(-1).customerId, 88);
  assert.equal((await importCatalogFile(db, filename)).imported, false);
  await fs.writeFile(filename, Buffer.from(raw.toString().replace('"revision":19', '"revision":20')));
  await assert.rejects(importCatalogFile(db, filename), /데이터/);
});

test('administrator product PATCH requires a real session and rejects cross-origin writes', async () => {
  const { NextRequest } = require('next/server');
  const { PATCH } = require('../app/api/admin/products/[id]/route.ts');
  setServicesForTests(createServices());
  try {
    const request = (cookie, origin = 'http://localhost') => new NextRequest('http://localhost/api/admin/products/0', { method: 'PATCH', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ price: 19000 }) });
    const context = () => ({ params: Promise.resolve({ id: '0' }) });
    assert.equal((await PATCH(request(), context())).status, 401);
    assert.equal((await PATCH(request(undefined, 'http://different.example'), context())).status, 403);
    const identity = createIdentityService({ repository: createPostgresIdentityRepository(db) });
    const issued = await identity.login('integration-admin', 'integration-password');
    assert.equal((await PATCH(request('lb_admin=' + issued.token), context())).status, 200);
    const oversized = new NextRequest('http://localhost/api/admin/products/0', { method: 'PATCH', headers: { cookie: 'lb_admin=' + issued.token, origin: 'http://localhost' }, body: ' '.repeat(20_000) });
    assert.equal((await PATCH(oversized, context())).status, 413);
    assert.equal((await findProductById(0)).price, 19000);
  } finally { setServicesForTests(undefined); }
});
