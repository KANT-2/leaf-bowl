/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../infrastructure/database/prisma.ts");
const { readCatalog, writeCatalog } = require("../application/catalog.ts");
const { verifyReviewPurchase, appendPurchasedReview, ownReviewSubmissions } = require("../application/reviews.ts");
const { createOrdersService } = require("../modules/orders/service.ts");
const { createPostgresOrdersRepository } = require("../infrastructure/orders/postgres.ts");
const { publicSnapshot } = require("../modules/catalog/public-snapshot.ts");
const { applyDefaultSql } = require("../seed/sql.ts");
const { createOrderSchema } = require("../modules/orders/schema.ts");
const { hashPassword } = require("../modules/identity/crypto.ts");

const db = prisma();
assert.match(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)), /(?:^|[_-])test$/);
after(() => db.$disconnect());
test("review authorization enforces ownership, completion, product, uniqueness and durable deletion claims", async () => {
  await applyDefaultSql(process.env.DATABASE_URL);
  const session = randomUUID();
  const admin = await db.adminUser.create({
    data: { loginId: "review-test-" + randomUUID(), passwordHash: await hashPassword("test-only-password") },
  });
  const catalog = await readCatalog();
  const product = catalog.catalog.products.find((p) => p.type === "salad" && !p.deleted && p.status === "active");
  const future = new Date(Date.now() + 3 * 86400_000);
  future.setUTCHours(3, 0, 0, 0);
  const orders = createOrdersService({ repository: createPostgresOrdersRepository(db) });
  const { order } = await orders.createOrder(
    session,
    randomUUID(),
    createOrderSchema.parse({
      ordererName: "리뷰 권한 테스트",
      phone: "010-1234-5678",
      address: "서울 중구",
      addressDetail: "",
      desiredStartAt: future.toISOString(),
      desiredEndAt: new Date(future.getTime() + 3600_000).toISOString(),
      items: [{ productId: product.customerId, dressingKeys: ["dressing-0"], drinkKeys: ["drink-1"], quantity: 2 }],
    }),
  );
  const review = {
    id: "auth-" + randomUUID(),
    pid: product.customerId,
    orderItemId: order.items[0].id,
    author: "테스트",
    stars: 5,
    title: "리뷰 권한",
    text: "실제 완료 주문만 리뷰를 남깁니다.",
    via: "delivery",
  };
  try {
    await assert.rejects(verifyReviewPurchase(randomUUID(), review), (e) => e.status === 404);
    await assert.rejects(
      verifyReviewPurchase(session, { ...review, orderItemId: "9223372036854775807" }),
      (e) => e.status === 404,
    );
    await assert.rejects(verifyReviewPurchase(session, review), (e) => e.status === 400);
    let currentOrder = order;
    for (const status of ["confirmed", "preparing", "delivering", "completed"]) {
      currentOrder = await orders.changeStatus(admin.id, order.id, { status, version: currentOrder.version });
    }
    await assert.rejects(verifyReviewPurchase(session, { ...review, pid: 9999 }), (e) => e.status === 400);
    const outcomes = await Promise.allSettled([
      appendPurchasedReview(session, review),
      appendPurchasedReview(session, { ...review, id: "second-" + randomUUID() }),
    ]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(outcomes.find((r) => r.status === "rejected").reason.status, 409);
    const claims = await ownReviewSubmissions(session);
    assert.equal(claims.length, 1);
    assert.deepEqual(await ownReviewSubmissions(randomUUID()), []);
    const winner = { ...review, id: claims[0].reviewId };
    const first = await readCatalog();
    assert.equal((await appendPurchasedReview(session, winner)).revision, first.revision);
    assert.doesNotMatch(JSON.stringify(publicSnapshot(first)), /customerSessionId|orderItemId/);
    first.catalog.reviews = first.catalog.reviews.filter((r) => r.id !== winner.id);
    const purged = await writeCatalog(first.catalog, first.revision);
    assert.equal((await appendPurchasedReview(session, winner)).revision, purged.revision);
    await assert.rejects(
      appendPurchasedReview(session, { ...review, id: "third-" + randomUUID() }),
      (e) => e.status === 409,
    );
    assert.equal(await db.review.count({ where: { id: winner.id } }), 0);
  } finally {
    await db.reviewSubmission.deleteMany({ where: { customerSessionId: session } });
    await db.order.delete({ where: { id: order.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
  }
});
