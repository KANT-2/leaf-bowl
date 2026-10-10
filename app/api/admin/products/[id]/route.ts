// PATCH /api/admin/products/salad-0 → 메뉴 1개 수정 (카탈로그 기준)
// 본문 예: { "price": 11900, "status": "soldout" }  보낸 항목만 바뀐다.
// 전체 저장(PUT /api/admin/catalog)과 같은 저장소·revision 규칙을 쓴다. 관리자 로그인 확인은 후속.
import { catalogSchema, productSchema } from "@/lib/admin/catalog";
import { readCatalog, writeCatalog } from "@/lib/admin/store";
import { BodyTooLarge, jsonError, readLimited, sameOrigin } from "@/lib/admin/server";

const changes = productSchema
  .pick({ name: true, description: true, price: true, status: true, badge: true, category: true, allergens: true })
  .partial()
  .strict();

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/products/[id]">) {
  if (!sameOrigin(request)) return jsonError("허용되지 않은 요청입니다.", 403);
  const { id } = await ctx.params;
  try {
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(await readLimited(request, 16000)));
    } catch (e) {
      if (e instanceof BodyTooLarge) return jsonError("요청이 너무 큽니다.", 413);
      return jsonError("올바른 JSON이 아닙니다.");
    }
    const parsed = changes.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "수정할 내용을 확인해주세요.");
    if (Object.keys(parsed.data).length === 0) {
      return jsonError("수정할 항목을 하나 이상 보내 주세요 (name, description, price, status, badge, category, allergens).");
    }

    const { catalog, revision } = await readCatalog();
    const target = catalog.products.find((p) => p.id === id && !p.deleted);
    if (!target) return jsonError("상품을 찾을 수 없습니다.", 404);

    const next = { ...catalog, products: catalog.products.map((p) => (p.id === id ? { ...p, ...parsed.data } : p)) };
    const valid = catalogSchema.safeParse(next);
    if (!valid.success) return jsonError(valid.error.issues[0]?.message ?? "수정할 내용을 확인해주세요.");

    const saved = await writeCatalog(next, revision);
    if (!saved) return jsonError("다른 화면에서 데이터가 변경되었습니다. 다시 시도해주세요.", 409);
    return Response.json(saved.catalog.products.find((p) => p.id === id), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("저장하지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
  }
}
