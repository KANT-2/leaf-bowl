// GET /api/products/0 → 샐러드 상세 (알레르기, 드레싱·음료 옵션, 별점). id 는 고객 주소 번호.
import { connection } from "next/server";
import { readCatalog } from "@/lib/admin/store";
import { jsonError } from "@/lib/admin/server";
import { findSalad, productDetail } from "@/lib/customer/api";

export async function GET(_request: Request, ctx: RouteContext<"/api/products/[id]">) {
  await connection();
  const { id } = await ctx.params;
  try {
    const { catalog } = await readCatalog();
    const salad = /^\d+$/.test(id) ? findSalad(catalog, Number(id)) : undefined;
    if (!salad) return jsonError("상품을 찾을 수 없습니다.", 404);
    return Response.json(productDetail(catalog, salad), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("상품을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
  }
}
