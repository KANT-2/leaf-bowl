import { services } from "@/application/container";
import { fastapiAdminEnabled, forwardAdminRequest } from "@/application/fastapi-admin-bridge";
import { jsonResponse, parseOrThrow, run } from "@/infrastructure/http/response";
import { requireAdmin } from "@/modules/identity/guard";
import { adminListItemView } from "@/modules/orders/presenter";
import { adminOrderListQuerySchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";

/** 관리자 주문 목록: 기존 Next.js 응답 계약 items/nextCursor 유지 */
export async function GET(request: Request) {
  return run(async () => {
    const params = new URL(request.url).searchParams;
    const query = parseOrThrow(
      adminOrderListQuerySchema,
      Object.fromEntries(
        ["status", "from", "to", "limit", "cursor", "deliveryDate", "deliveryHour"].flatMap((key) =>
          params.has(key) ? [[key, params.get(key)]] : [],
        ),
      ),
      "조회 조건을 확인해주세요.",
    );

    if (fastapiAdminEnabled()) {
      if (query.deliveryDate !== undefined || query.deliveryHour !== undefined) {
        // FastAPI 관리자 목록은 아직 deliveryDate/deliveryHour 서버측 필터 미구현.
        throw new AppError(400, "배달일·시간 필터는 FastAPI 연동에서 아직 지원하지 않습니다.");
      }
      const apiParams = new URLSearchParams();
      apiParams.set("limit", String(query.limit));
      if (query.status) {
        apiParams.set("status", query.status);
      }
      if (query.from) {
        apiParams.set("from", query.from);
      }
      if (query.to) {
        apiParams.set("to", query.to);
      }
      if (query.cursor) {
        apiParams.set("cursor", query.cursor);
      }
      return forwardAdminRequest(request, `/api/admin/orders?${apiParams.toString()}`);
    }

    const { identity, orders } = services();
    await requireAdmin(request, identity);
    const { items, nextCursor } = await orders.listOrders(query);
    return jsonResponse({ items: items.map(adminListItemView), nextCursor });
  });
}
