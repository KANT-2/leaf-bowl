// GET /api/products?type=salad&category=든든한 단백질
// type: salad(기본) · drink · dressing. 숨김·삭제 상품은 나오지 않고 품절은 status 로 표시한다.
import { connection } from "next/server";
import { readCatalog } from "@/lib/admin/store";
import { jsonError } from "@/lib/admin/server";
import { PRODUCT_TYPES, categoriesOf, listProducts, type ProductType } from "@/lib/customer/api";

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "salad";
  if (!(PRODUCT_TYPES as readonly string[]).includes(type)) {
    return jsonError(`type 은 ${PRODUCT_TYPES.join(", ")} 중 하나여야 합니다.`);
  }
  try {
    const { catalog } = await readCatalog();
    const categories = categoriesOf(catalog);
    const category = params.get("category") ?? undefined;
    if (category && type === "salad" && !categories.includes(category)) {
      return jsonError(`알 수 없는 분류입니다: ${category}`);
    }
    return Response.json(
      { items: listProducts(catalog, type as ProductType, category), categories: type === "salad" ? categories : [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError("상품을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
  }
}
