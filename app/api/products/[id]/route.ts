// GET /api/products/0 → 샐러드 상세 (알레르기, 드레싱·음료 옵션, 별점). id 는 고객 주소 번호.
import { readCatalog } from "@/application/catalog";
import { jsonResponse, run } from "@/infrastructure/http/response";
import { findSalad, productDetail } from "@/modules/catalog/customer-api";
import { AppError } from "@/modules/shared/errors";

export async function GET(_request: Request, ctx: RouteContext<"/api/products/[id]">) {
  return run(async () => {
    const { id } = await ctx.params;
    const { catalog } = await readCatalog();
    const salad = /^\d+$/.test(id) ? findSalad(catalog, Number(id)) : undefined;
    if (!salad) {
      throw new AppError(404, "상품을 찾을 수 없습니다.");
    }
    return jsonResponse(productDetail(catalog, salad));
  });
}
