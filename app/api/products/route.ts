// GET /api/products?type=salad&category=든든한 단백질
// type: salad(기본) · drink · dressing. 숨김·삭제 상품은 나오지 않고 품절은 status 로 표시한다.
import { readCatalog } from "@/application/catalog";
import { jsonResponse, run } from "@/infrastructure/http/response";
import { PRODUCT_TYPES, categoriesOf, listProducts, type ProductType } from "@/modules/catalog/customer-api";
import { AppError } from "@/modules/shared/errors";

export async function GET(request: Request) {
  return run(async () => {
    const params = new URL(request.url).searchParams;
    const type = params.get("type") ?? "salad";
    if (!(PRODUCT_TYPES as readonly string[]).includes(type)) {
      throw new AppError(400, `type 은 ${PRODUCT_TYPES.join(", ")} 중 하나여야 합니다.`);
    }
    const { catalog } = await readCatalog();
    const categories = categoriesOf(catalog);
    const category = params.get("category") ?? undefined;
    if (category && type === "salad" && !categories.includes(category)) {
      throw new AppError(400, `알 수 없는 분류입니다: ${category}`);
    }
    return jsonResponse({
      items: listProducts(catalog, type as ProductType, category),
      categories: type === "salad" ? categories : [],
    });
  });
}
