// GET /api/products/0/reviews?page=1&size=10 → 메뉴 리뷰 (최신순) + 평균 별점
import { readCatalog } from "@/application/catalog";
import { jsonResponse, run } from "@/infrastructure/http/response";
import { findSalad, parsePaging, productReviews } from "@/modules/catalog/customer-api";
import { AppError } from "@/modules/shared/errors";

export async function GET(request: Request, ctx: RouteContext<"/api/products/[id]/reviews">) {
  return run(async () => {
    const { id } = await ctx.params;
    const paging = parsePaging(new URL(request.url).searchParams);
    if (!paging) {
      throw new AppError(400, "page 는 1 이상, size 는 1~50 사이의 정수여야 합니다.");
    }
    const { catalog } = await readCatalog();
    const salad = /^\d+$/.test(id) ? findSalad(catalog, Number(id)) : undefined;
    if (!salad) {
      throw new AppError(404, "상품을 찾을 수 없습니다.");
    }
    return jsonResponse(productReviews(catalog, salad, paging.page, paging.size));
  });
}
