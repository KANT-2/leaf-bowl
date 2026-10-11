/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
require("./register-typescript.cjs");
const time = require("../modules/shared/time.ts");
const { normalizeReviewTime } = require("../modules/reviews/time.ts");
const { customerSeed } = require("../seed/legacy/catalog.ts");
const { customerCatalog: projectCustomerCatalog } = require("../modules/catalog/customer-view.ts");
    const { withDefaults } = require("./fixtures/settings.cjs");
    const customerCatalog = value => projectCustomerCatalog(withDefaults(value));
const { reviewSchema } = require("../modules/catalog/schema.ts");
const { reviewDisplayDate } = require("../modules/reviews/model.ts");

const at = "2026-12-31T15:10:00.000Z"; // KST 2027-01-01 00:10
const sample = () => ({ ...customerSeed().reviews[0], id: "utc-review", date: "2026.12.31", createdAt: at });

async function withCatalog(fn) {
  const previous = process.env.ADMIN_DATA_DIR;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "front5-time-"));
  process.env.ADMIN_DATA_DIR = directory;
  try { await fn(directory, require("../tests/fixtures/file-catalog.ts")); }
  finally {
    if (previous === undefined) delete process.env.ADMIN_DATA_DIR; else process.env.ADMIN_DATA_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("timestamps normalize explicit offsets and reject missing zones and rolled calendar dates", () => {
  assert.equal(time.normalizeUTC("2027-01-01T00:10:00+09:00"), at);
  assert.equal(time.normalizeUTC("2026-12-31T07:10:00-08:00"), at);
  for (const value of ["2026-12-31T15:10:00", "2026-02-30T00:00:00Z", "2026-12-31T24:00:00Z", "2026-01-01", "2026-01-01T00:00:00+25:00", "unknown", null]) assert.equal(time.normalizeUTC(value), null);
  assert.equal(time.legacyKSTUTC("2027.01.01 00:10"), at);
  assert.equal(time.legacyKSTUTC("2027.01.01"), "2027-01-01T03:00:00.000Z");
  assert.equal(time.legacyKSTUTC("2026.02.30"), null);
});

test("all shared review/calendar conversions agree in three server zones across year and DST boundaries", () => {
  const script = `require('./tests/register-typescript.cjs');
    const time = require('./modules/shared/time.ts');
    const { dateStr, reviewDisplayDate } = require('./modules/reviews/model.ts');
    const { salesPeriodStart } = require('./modules/reports/sales.ts');
    const { customerSeed } = require('./seed/legacy/catalog.ts');
    const { customerCatalog: projectCustomerCatalog } = require('./modules/catalog/customer-view.ts');
    const { withDefaults } = require('./tests/fixtures/settings.cjs');
    const customerCatalog = value => projectCustomerCatalog(withDefaults(value));
    const rows = ['2026-12-31T15:10:00Z','2026-03-08T15:10:00Z','2026-11-01T15:10:00Z'].map(createdAt => {
      const ms = Date.parse(createdAt);
      const catalog = customerSeed();
      catalog.reviews = [{ ...catalog.reviews[0], date: 'stale', createdAt }];
      const r = customerCatalog({ catalog }).reviews[0];
      return { day: time.kstDate(ms), next: time.kstDate(ms,1), date: dateStr(ms), display: reviewDisplayDate(r), timestamp: r.t, review: time.reviewDateTime({date:'stale',createdAt}), period: salesPeriodStart('today',new Date(ms)), legacy: time.legacyKSTUTC('2027.01.01 00:10'), slot: time.isAtLeast30MinAhead(time.kstDate(ms),'10:00',ms) };
    }); process.stdout.write(JSON.stringify(rows));`;
  const output = ["UTC", "Asia/Seoul", "America/Los_Angeles"].map(TZ => execFileSync(process.execPath, ["-e", script], { cwd: path.join(__dirname, ".."), env: { ...process.env, TZ }, encoding: "utf8" }));
  assert.equal(output[0], output[1]); assert.equal(output[0], output[2]);
  const first = JSON.parse(output[0])[0];
  assert.equal(first.day, "2027-01-01"); assert.equal(first.review, "2027.01.01 00:10");
  assert.equal(first.display, "2027.01.01"); assert.equal(first.period, Date.parse("2026-12-31T15:00:00Z"));
});

test("legacy review labels convert to UTC while customer displays use authoritative timestamp dates", () => {
  const offset = normalizeReviewTime({ ...sample(), createdAt: "2027-01-01T00:10:00+09:00" });
  assert.equal(offset.createdAt, at); assert.equal(offset.date, "2027.01.01");
  const legacy = { ...sample(), createdAt: undefined };
  const migrated = normalizeReviewTime({ ...legacy, date: "2027.01.01 00:10" });
  assert.equal(migrated.createdAt, at);
  assert.deepEqual(normalizeReviewTime({ date: "오래전" }), { date: "오래전" });
  const catalog = customerSeed(); catalog.reviews = [sample()];
  const r = customerCatalog({ catalog }).reviews[0];
  assert.equal(r.date, "2027.01.01"); assert.equal(r.t, Date.parse(at));
  assert.equal(reviewDisplayDate({ date: "old cached date", t: r.t }), "2027.01.01");
  assert.equal(reviewSchema.parse(offset).createdAt, at);
  assert.throws(() => reviewSchema.parse({ ...sample(), createdAt: "2027-01-01T00:10:00" }));
});

test("schema 3 timezone migration backs up data, preserves purges/IDs and writes UTC schema 4", async () => {
  await withCatalog(async (directory, { readCatalog }) => {
    const catalog = customerSeed(); const deleted = catalog.reviews[0].id;
    catalog.reviews = [{ ...sample(), createdAt: "2027-01-01T00:10:00+09:00" }];
    const old = { schemaVersion: 3, catalog, revision: 7, updatedAt: "2027-01-01T00:10:00+09:00", deletedReviewIds: [deleted], nextCustomerId: 88 };
    fs.writeFileSync(path.join(directory, "catalog.json"), JSON.stringify(old));
    const result = await readCatalog();
    assert.equal(result.revision, 8); assert.equal(result.catalog.reviews.length, 1);
    assert.equal(result.catalog.reviews[0].createdAt, at); assert.equal(result.catalog.reviews[0].date, "2027.01.01");
    assert.deepEqual(result.catalog.products.map(p => p.customerId), old.catalog.products.map(p => p.customerId));
    const stored = JSON.parse(fs.readFileSync(path.join(directory, "catalog.json")));
    assert.equal(stored.schemaVersion, 4); assert.equal(stored.nextCustomerId, 88);
    assert.deepEqual(stored.deletedReviewIds, [deleted]); assert.ok(stored.updatedAt.endsWith("Z"));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "catalog.v3.backup.json"))), old);
    assert.equal((await readCatalog()).revision, 8);
  });
});

test("new reviews store server UTC instants and a KST calendar date at midnight", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) });
  try {
    await withCatalog(async (directory, { appendCustomerReview }) => {
      const result = await appendCustomerReview({ id: "new-utc-review", pid: 0, author: "고객", stars: 5, title: "시각 검증", text: "서버의 UTC 시각과 KST 표시 날짜를 검증합니다.", via: "delivery" });
      const r = result.catalog.reviews[0];
      assert.equal(r.createdAt, at); assert.equal(r.date, "2027.01.01");
      assert.equal(result.updatedAt, at);
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "catalog.json"))).catalog.reviews[0].createdAt, at);
    });
  } finally { t.mock.timers.reset(); }
});

test("sales payloads return canonical UTC and reject timezone-free or impossible timestamps", () => {
  const { salesDataSchema, buildSalesReport } = require("../modules/reports/sales.ts");
  const raw = { updatedAt: "2027-01-01T00:10:00+09:00", orders: [{ id: "paid", status: "paid", paidAt: "2027-01-01T00:00:00+09:00", items: [] }] };
  const data = salesDataSchema.parse(raw);
  assert.equal(data.updatedAt, at); assert.equal(data.orders[0].paidAt, "2026-12-31T15:00:00.000Z");
  assert.equal(buildSalesReport(customerSeed(), data, "today", new Date(at)).updatedAt, at);
  assert.throws(() => salesDataSchema.parse({ ...raw, updatedAt: "2027-01-01T00:10:00" }));
  assert.throws(() => salesDataSchema.parse({ ...raw, updatedAt: "2027-02-30T00:00:00Z" }));
});

test("pagination cursor normalizes offsets and rejects ambiguous wall clocks", () => {
  const { encodeCursor, decodeCursor } = require("../modules/shared/cursor.ts");
  const id = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(decodeCursor(encodeCursor({ id, createdAt: "2027-01-01T00:10:00+09:00" })), { id, createdAt: at });
  const legacy = Buffer.from(JSON.stringify({ i: id, c: "2027-01-01T00:10:00" })).toString("base64url");
  assert.throws(() => decodeCursor(legacy), /cursor/);
});

test("browser review caches display KST and saved recipes normalize offset timestamps to UTC", () => {
  const previous = global.localStorage;
  const values = new Map([
    ["bm-recipe", JSON.stringify({ name: "내 조합", ingredients: ["romaine"], dressing: -1, price: 7500, savedAt: "2027-01-01T00:10:00+09:00" })],
    ["bb-user-reviews", JSON.stringify([{ id: "old-date", pid: 0, author: "고객", stars: 5, title: "리뷰", text: "검증", via: "delivery", t: Date.parse(at), date: "2026.12.31" }])],
  ]);
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    const { recipeStore } = require("../infrastructure/browser/bowl-store.ts");
    assert.equal(recipeStore.getSnapshot().savedAt, at);
    recipeStore.set({ ...recipeStore.getSnapshot(), savedAt: "2027-01-01T00:10:00+09:00" });
    assert.equal(JSON.parse(values.get("bm-recipe")).savedAt, at);
    const { loadUserReviews, saveUserReviews } = require("../infrastructure/browser/review-storage.ts");
    const reviews = loadUserReviews(); assert.equal(reviews[0].date, "2027.01.01");
    saveUserReviews(reviews); assert.equal(JSON.parse(values.get("bb-user-reviews"))[0].date, "2027.01.01");
  } finally { if (previous === undefined) delete global.localStorage; else global.localStorage = previous; }
});
