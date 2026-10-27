import "server-only";
import { databaseTransaction, prisma, type DatabaseTransaction } from "@/infrastructure/database/prisma";
import { lockCatalog, readCatalogState } from "@/infrastructure/catalog/postgres";
import { saveCatalogChanges } from "@/infrastructure/catalog/changes";
import { readAppDefaults } from "@/infrastructure/settings/postgres";
import { addReview, snapshot, type ReviewInput } from "@/modules/catalog/state";
import { AppError } from "@/modules/shared/errors";
import { validateNewImages } from "@/application/images";
import type { Prisma } from "@/generated/prisma/client";

export type PurchasedReviewInput = ReviewInput & { orderItemId: string };

/**
 * 요청이 증명한 주문 주인: 비회원 세션 쿠키, FastAPI 가 확인한 회원 토큰, 또는 둘 다.
 * 품목의 주문 주인이 이 중 하나와 같아야 리뷰를 쓸 수 있다.
 */
export interface ReviewIdentity {
  customerSessionId?: string;
  customerId?: bigint;
}

/** A browser profile/email is never an authorization credential. */
async function checkPurchase(tx: DatabaseTransaction, identity: ReviewIdentity, input: PurchasedReviewInput) {
  const item = await tx.orderItem.findUnique({
    where: { id: BigInt(input.orderItemId) },
    include: { order: true, product: true },
  });
  // 주문의 주인은 세션·회원 중 정확히 하나다 (chk_order_owner)
  const owned =
    item &&
    (item.order.customerId !== null
      ? item.order.customerId === identity.customerId
      : item.order.customerSessionId === identity.customerSessionId);
  if (!item || !owned) {
    throw new AppError(404, "리뷰를 작성할 주문 품목을 찾을 수 없습니다.");
  }
  const owner = { customerSessionId: item.order.customerSessionId, customerId: item.order.customerId };
  const claim = await tx.reviewSubmission.findUnique({ where: { reviewId: input.id } });
  if (claim) {
    if (
      claim.orderItemId !== item.id ||
      claim.customerSessionId !== owner.customerSessionId ||
      claim.customerId !== owner.customerId
    ) {
      throw new AppError(409, "이미 사용된 리뷰 요청 번호입니다.");
    }
    // Includes retries after the administrator permanently removed this review/product.
    return { retry: true, owner };
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
  return { retry: false, owner };
}

/** Reject unauthorized purchases before decoding/writing potentially expensive photos. */
export function verifyReviewPurchase(identity: ReviewIdentity, input: PurchasedReviewInput) {
  return databaseTransaction(prisma(), (tx) => checkPurchase(tx, identity, input));
}

export function appendPurchasedReview(identity: ReviewIdentity, input: PurchasedReviewInput) {
  return databaseTransaction(prisma(), async (tx) => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    const { retry, owner } = await checkPurchase(tx, identity, input);
    if (retry) {
      return { ...snapshot(current), defaults: await readAppDefaults(tx) };
    }
    if (current.deletedReviewIds.includes(input.id) || current.catalog.reviews?.some((r) => r.id === input.id)) {
      throw new AppError(409, "이미 사용된 리뷰 요청 번호입니다.");
    }
    const next = addReview(current, input, new Date().toISOString());
    await validateNewImages(current.catalog, next.catalog);
    await tx.reviewSubmission.create({
      data: { orderItemId: BigInt(input.orderItemId), reviewId: input.id, ...owner },
    });
    await saveCatalogChanges(tx, current, next);
    return { ...snapshot(next), defaults: await readAppDefaults(tx) };
  });
}

/** Private purchase claims are deliberately absent from the public catalog. */
export async function ownReviewSubmissions(identity: ReviewIdentity) {
  const owners: Prisma.ReviewSubmissionWhereInput[] = [];
  if (identity.customerSessionId) {
    owners.push({ customerSessionId: identity.customerSessionId });
  }
  if (identity.customerId !== undefined) {
    owners.push({ customerId: identity.customerId });
  }
  if (!owners.length) {
    return [];
  }
  const rows = await prisma().reviewSubmission.findMany({
    where: { OR: owners },
    select: { reviewId: true, orderItemId: true },
    orderBy: { orderItemId: "desc" },
  });
  return rows.map((r) => ({ reviewId: r.reviewId, orderItemId: r.orderItemId.toString() }));
}
