// GET /api/products/0/reviews?page=1&size=10 → 메뉴 리뷰 (최신순) + 평균 별점
import { connection } from "next/server";
import { readCatalog } from "@/lib/admin/store";
import { jsonError } from "@/lib/admin/server";
import { findSalad, parsePaging, productReviews } from "@/lib/customer/api";

export async function GET(request: Request, ctx: RouteContext<"/api/products/[id]/reviews">) {
  await connection();
  const { id } = await ctx.params;
  const paging = parsePaging(new URL(request.url).searchParams);
  if (!paging) return jsonError("page 는 1 이상, size 는 1~50 사이의 정수여야 합니다.");
  try {
    const { catalog } = await readCatalog();
    const salad = /^\d+$/.test(id) ? findSalad(catalog, Number(id)) : undefined;
    if (!salad) return jsonError("상품을 찾을 수 없습니다.", 404);
    return Response.json(productReviews(catalog, salad, paging.page, paging.size), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("리뷰를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
  }
}
