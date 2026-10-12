import "server-only";
import { databaseTransaction, prisma, type DatabaseTransaction } from "@/infrastructure/database/prisma";
import { lockCatalog, readCatalogState } from "@/infrastructure/catalog/postgres";
import { saveCatalogChanges } from "@/infrastructure/catalog/changes";
import { readAppDefaults } from "@/infrastructure/settings/postgres";
import { addReview, snapshot, type ReviewInput } from "@/modules/catalog/state";
import { AppError } from "@/modules/shared/errors";
import { validateNewImages } from "@/application/images";

export type PurchasedReviewInput = ReviewInput & { orderItemId: string };

/** A browser profile/email is never an authorization credential. */
async function checkPurchase(tx: DatabaseTransaction, sessionId: string, input: PurchasedReviewInput) {
  const item = await tx.orderItem.findUnique({
    where: { id: BigInt(input.orderItemId) },
    include: { order: true, product: true },
  });
  if (!item || item.order.customerSessionId !== sessionId) {
    throw new AppError(404, "리뷰를 작성할 주문 품목을 찾을 수 없습니다.");
  }
  const claim = await tx.reviewSubmission.findUnique({ where: { reviewId: input.id } });
  if (claim) {
    if (claim.customerSessionId !== sessionId || claim.orderItemId !== item.id) {
      throw new AppError(409, "이미 사용된 리뷰 요청 번호입니다.");
    }
    // Includes retries after the administrator permanently removed this review/product.
    return true;
  }
  if (await tx.reviewSubmission.findUnique({ where: { orderItemId: item.id } })) {
    throw new AppError(409, "이미 리뷰를 작성한 주문 품목입니다.");
  }
  if (
    item.order.status !== "completed" ||
    item.productType !== "salad" ||
    !item.product ||
    item.product.customerId !== input.pid ||
    item.product.type !== "salad" ||
    item.product.deleted ||
    item.product.status === "hidden"
  ) {
    throw new AppError(400, "완료된 주문의 해당 샐러드에만 리뷰를 작성할 수 있습니다.");
  }
  return false;
}

/** Reject unauthorized purchases before decoding/writing potentially expensive photos. */
export function verifyReviewPurchase(sessionId: string, input: PurchasedReviewInput) {
  return databaseTransaction(prisma(), (tx) => checkPurchase(tx, sessionId, input));
}

export function appendPurchasedReview(sessionId: string, input: PurchasedReviewInput) {
  return databaseTransaction(prisma(), async (tx) => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    const retry = await checkPurchase(tx, sessionId, input);
    if (retry) {
      return { ...snapshot(current), defaults: await readAppDefaults(tx) };
    }
    if (current.deletedReviewIds.includes(input.id) || current.catalog.reviews?.some((r) => r.id === input.id)) {
      throw new AppError(409, "이미 사용된 리뷰 요청 번호입니다.");
    }
    const next = addReview(current, input, new Date().toISOString());
    await validateNewImages(current.catalog, next.catalog);
    await tx.reviewSubmission.create({
      data: { orderItemId: BigInt(input.orderItemId), reviewId: input.id, customerSessionId: sessionId },
    });
    await saveCatalogChanges(tx, current, next);
    return { ...snapshot(next), defaults: await readAppDefaults(tx) };
  });
}

/** Private purchase claims are deliberately absent from the public catalog. */
export async function ownReviewSubmissions(sessionId: string) {
  const rows = await prisma().reviewSubmission.findMany({
    where: { customerSessionId: sessionId },
    select: { reviewId: true, orderItemId: true },
    orderBy: { orderItemId: "desc" },
  });
  return rows.map((r) => ({ reviewId: r.reviewId, orderItemId: r.orderItemId.toString() }));
}
