import { requireAdmin } from "@/modules/identity/guard";
import { services } from "@/modules/container";
import { adminListItemView } from "@/modules/orders/presenter";
import { adminOrderListQuerySchema } from "@/modules/orders/schema";
import { jsonResponse, parseOrThrow, run } from "@/modules/shared/http";

/** 관리자 주문 목록: 상태·접수일 범위(from, to)로 거른 최신순, 마지막으로 본 주문(cursor) 기준 다음 쪽 */
export async function GET(request: Request) {
  return run(async () => {
    const { identity, orders } = services();
    await requireAdmin(request, identity);
    const params = new URL(request.url).searchParams;
    const query = parseOrThrow(
      adminOrderListQuerySchema,
      Object.fromEntries(["status", "from", "to", "limit", "cursor"].flatMap((k) => (params.has(k) ? [[k, params.get(k)]] : []))),
      "조회 조건을 확인해주세요.",
    );
    const { items, nextCursor } = await orders.listOrders(query);
    return jsonResponse({ items: items.map(adminListItemView), nextCursor });
  });
}
