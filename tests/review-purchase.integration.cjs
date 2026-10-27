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
const guest = (customerSessionId) => ({ customerSessionId });

/** 완료 직전까지 갈 수 있는 샐러드 1품목 주문을 만든다 */
async function placeSaladOrder(session) {
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
  return { orders, order, product };
}

async function complete(orders, adminId, order) {
  let current = order;
  for (const status of ["confirmed", "preparing", "delivering", "completed"]) {
    current = await orders.changeStatus(adminId, order.id, { status, version: current.version });
  }
  return current;
}
test("review authorization enforces ownership, completion, product, uniqueness and durable deletion claims", async () => {
  await applyDefaultSql(process.env.DATABASE_URL);
  const session = randomUUID();
  const admin = await db.adminUser.create({
    data: { loginId: "review-test-" + randomUUID(), passwordHash: await hashPassword("test-only-password") },
  });
  const { orders, order, product } = await placeSaladOrder(session);
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
    await assert.rejects(verifyReviewPurchase(guest(randomUUID()), review), (e) => e.status === 404);
    await assert.rejects(
      verifyReviewPurchase(guest(session), { ...review, orderItemId: "9223372036854775807" }),
      (e) => e.status === 404,
    );
    await assert.rejects(verifyReviewPurchase(guest(session), review), (e) => e.status === 400);
    await complete(orders, admin.id, order);
    await assert.rejects(verifyReviewPurchase(guest(session), { ...review, pid: 9999 }), (e) => e.status === 400);
    const outcomes = await Promise.allSettled([
      appendPurchasedReview(guest(session), review),
      appendPurchasedReview(guest(session), { ...review, id: "second-" + randomUUID() }),
    ]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(outcomes.find((r) => r.status === "rejected").reason.status, 409);
    const claims = await ownReviewSubmissions(guest(session));
    assert.equal(claims.length, 1);
    assert.deepEqual(await ownReviewSubmissions(guest(randomUUID())), []);
    const winner = { ...review, id: claims[0].reviewId };
    const first = await readCatalog();
    assert.equal((await appendPurchasedReview(guest(session), winner)).revision, first.revision);
    assert.doesNotMatch(JSON.stringify(publicSnapshot(first)), /customerSessionId|orderItemId/);
    first.catalog.reviews = first.catalog.reviews.filter((r) => r.id !== winner.id);
    const purged = await writeCatalog(first.catalog, first.revision);
    assert.equal((await appendPurchasedReview(guest(session), winner)).revision, purged.revision);
    await assert.rejects(
      appendPurchasedReview(guest(session), { ...review, id: "third-" + randomUUID() }),
      (e) => e.status === 409,
    );
    assert.equal(await db.review.count({ where: { id: winner.id } }), 0);
  } finally {
    await db.reviewSubmission.deleteMany({ where: { customerSessionId: session } });
    await db.order.delete({ where: { id: order.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
  }
});

test("member orders are reviewed by the member only, once per item, with the member recorded as the claim owner", async () => {
  await applyDefaultSql(process.env.DATABASE_URL);
  const member = { customerId: 9_001n };
  const admin = await db.adminUser.create({
    data: { loginId: "review-member-" + randomUUID(), passwordHash: await hashPassword("test-only-password") },
  });
  const { orders, order, product } = await placeSaladOrder(randomUUID());
  // 회원 주문(FastAPI UC-C)과 같은 모양: 주인은 회원, 세션은 NULL
  await db.order.update({ where: { id: order.id }, data: { customerSessionId: null, customerId: member.customerId } });
  const review = {
    id: "member-" + randomUUID(),
    pid: product.customerId,
    orderItemId: order.items[0].id,
    author: "회원",
    stars: 5,
    title: "회원 리뷰",
    text: "회원 주문도 완료되면 리뷰를 남깁니다.",
    via: "delivery",
  };
  try {
    await assert.rejects(verifyReviewPurchase(member, review), (e) => e.status === 400);
    await complete(orders, admin.id, order);
    await assert.rejects(verifyReviewPurchase({ customerId: 9_002n }, review), (e) => e.status === 404);
    await assert.rejects(verifyReviewPurchase(guest(randomUUID()), review), (e) => e.status === 404);

    // 같은 브라우저의 비회원 세션이 함께 와도 기록의 주인은 주문의 주인(회원)이다
    const saved = await appendPurchasedReview({ ...member, customerSessionId: randomUUID() }, review);
    const claim = await db.reviewSubmission.findUnique({ where: { orderItemId: BigInt(review.orderItemId) } });
    assert.equal(claim.customerId, member.customerId);
    assert.equal(claim.customerSessionId, null);
    assert.deepEqual(await ownReviewSubmissions(member), [{ reviewId: review.id, orderItemId: review.orderItemId }]);
    assert.deepEqual(await ownReviewSubmissions({ customerId: 9_002n }), []);

    assert.equal((await appendPurchasedReview(member, review)).revision, saved.revision);
    await assert.rejects(
      appendPurchasedReview(member, { ...review, id: "again-" + randomUUID() }),
      (e) => e.status === 409,
    );
    // 주인이 둘 다 없거나 둘 다 있는 기록은 DB 가 거절한다 (chk_review_submission_owner)
    for (const owner of ["NULL, NULL", "'" + randomUUID() + "'::uuid, 9001"]) {
      await assert.rejects(
        db.$executeRawUnsafe(
          `INSERT INTO review_submissions (order_item_id, review_id, customer_session_id, customer_id) VALUES (9223372036854775806, 'x-${randomUUID()}', ${owner})`,
        ),
        /chk_review_submission_owner/,
      );
    }
  } finally {
    await db.reviewSubmission.deleteMany({ where: { customerId: member.customerId } });
    await db.order.delete({ where: { id: order.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
  }
});
