import { publicSnapshot } from "@/modules/catalog/public-snapshot";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/modules/shared/errors";
import { readJsonBody } from "@/infrastructure/http/response";
import {
  appendPurchasedReview,
  ownReviewSubmissions,
  verifyReviewPurchase,
  type ReviewIdentity,
} from "@/application/reviews";
import { services } from "@/application/container";
import { resolveMemberId } from "@/application/fastapi-member";
import { requireGuest } from "@/modules/identity/guard";
import { readCookie } from "@/modules/identity/cookies";
import { GUEST_COOKIE } from "@/modules/identity/service";
import { CUSTOM_BOWL_PID } from "@/modules/reviews/model";
import { run, jsonResponse } from "@/infrastructure/http/response";
import { normalizeImage, saveImage, removeImage } from "@/infrastructure/images/files";
import { maintainImages } from "@/application/images";
import { sameOrigin, jsonError } from "@/infrastructure/http/request";
const schema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(80),
  /** 메뉴 번호. 내 취향 볼은 CUSTOM_BOWL_PID */
  pid: z.number().int().min(CUSTOM_BOWL_PID),
  orderItemId: z
    .string()
    .regex(/^[1-9][0-9]{0,18}$/)
    .refine((id) => /^[1-9][0-9]{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807")),
  author: z.string().trim().min(1).max(80),
  stars: z.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(200),
  text: z.string().trim().min(10).max(10000),
  via: z.enum(["pickup", "delivery"]),
  /** 브라우저에서 줄인 사진 (data: 주소), 최대 3장 */
  photos: z.array(z.string().max(1_500_000)).max(3).optional(),
});

/**
 * 회원 토큰이 있으면 FastAPI 가 확인한 회원과, 함께 온 비회원 세션(같은 브라우저의 비회원 주문용)을 쓴다.
 * 토큰이 없으면 기존처럼 비회원 세션이 필요하다.
 */
async function reviewIdentity(request: Request): Promise<ReviewIdentity> {
  const { identity } = services();
  const customerId = await resolveMemberId(request);
  if (customerId === null) {
    return { customerSessionId: (await requireGuest(request, identity)).id };
  }
  const session = await identity.resolve(readCookie(request, GUEST_COOKIE), "guest");
  return { customerId, ...(session && { customerSessionId: session.id }) };
}

/** 리뷰 사진 한 장 용량 한도 (줄인 뒤 기준) */
const PHOTO_MAX_BYTES = 1024 * 1024;

/** data: 주소를 검사해 [바이트, 확장자]로 바꾼다. 파일 내용이 PNG·JPEG·WebP 가 아니면 null */
async function decodePhoto(dataUrl: string) {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!m) {
    return null;
  }
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES || Buffer.from(bytes).toString("base64") !== m[1]) {
    return null;
  }
  return normalizeImage(bytes, PHOTO_MAX_BYTES);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError("허용되지 않은 요청입니다.", 403);
  }
  try {
    const { limits } = services();
    const owner = await reviewIdentity(request);
    limits.globalReview.hit("all");
    limits.review.hit(owner.customerId !== undefined ? "member:" + owner.customerId : owner.customerSessionId!);
    const body = await readJsonBody(request, 5 * 1024 * 1024);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonError("리뷰 내용을 확인해주세요.");
    }
    const { photos = [], ...review } = parsed.data;
    await verifyReviewPurchase(owner, review);
    const decoded = [];
    for (const photo of photos) {
      decoded.push(await decodePhoto(photo));
    }
    if (decoded.some((d) => d === null)) {
      return jsonError("사진은 JPG·PNG·WebP, 장당 1MB 이하로 올려주세요.");
    }
    // 사진은 관리자 이미지와 같은 폴더에 저장하고, 리뷰에는 주소만 남긴다.
    const saved: string[] = [];
    let referenced = new Set<string>();
    try {
      if (request.signal.aborted) {
        throw new AppError(408, "리뷰 요청이 취소되었습니다.");
      }
      for (const d of decoded) {
        saved.push(await saveImage(d!, "review-"));
      }
      const snapshot = await appendPurchasedReview(owner, {
        ...review,
        images: saved.map((key) => "/api/admin/images/" + key),
      });
      // 중복·삭제된 ID는 저장소가 성공 응답으로 무시한다. 그 요청의 새 사진은 참조되지 않는다.
      referenced = new Set((snapshot.catalog.reviews ?? []).flatMap((r) => r.images ?? []));
      await Promise.all(saved.filter((key) => !referenced.has("/api/admin/images/" + key)).map(removeImage));
      await maintainImages();
      return Response.json(publicSnapshot(snapshot), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (e) {
      // 리뷰 저장에 실패하면 먼저 써 둔 사진 파일도 지운다.
      await Promise.all(saved.filter((key) => !referenced.has("/api/admin/images/" + key)).map(removeImage));
      throw e;
    }
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) {
      return jsonError(e.status === 413 ? "리뷰가 너무 큽니다." : e.message, e.status);
    }
    console.error("[reviews] unexpected error:", e instanceof Error ? (e.stack ?? e.message) : String(e));
    return jsonError("리뷰를 저장하지 못했습니다. 다시 시도해주세요.", 503);
  }
}

export async function GET(request: Request) {
  return run(async () => {
    return jsonResponse({ submissions: await ownReviewSubmissions(await reviewIdentity(request)) });
  });
}
