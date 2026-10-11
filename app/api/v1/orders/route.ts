import { requireGuest } from "@/modules/identity/guard";
import { services } from "@/modules/container";
import { createdView, detailView } from "@/modules/orders/presenter";
import { createOrderSchema, idempotencyKeySchema, ownOrderListQuerySchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/modules/shared/http";

/** 주문 생성. 같은 Idempotency-Key 로 같은 내용을 다시 보내면 기존 주문을 200 으로 돌려준다 */
export async function POST(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    const { identity, orders, limits } = services();
    const session = await requireGuest(request, identity);
    limits.order.hit(session.id);
    const header = request.headers.get("idempotency-key");
    if (!header) throw new AppError(400, "Idempotency-Key 헤더가 필요합니다.");
    const key = parseOrThrow(idempotencyKeySchema, header, "Idempotency-Key 형식을 확인해주세요.");
    const input = parseOrThrow(createOrderSchema, await readJsonBody(request), "주문 내용을 확인해주세요.");
    const { order, created } = await orders.createOrder(session.id, key, input);
    return jsonResponse(createdView(order), created ? 201 : 200);
  });
}

/** 내 주문 목록: 이 방문자 세션으로 접수한 주문만 최신순 (마이페이지 주문 내역용) */
export async function GET(request: Request) {
  return run(async () => {
    const { identity, orders } = services();
    const session = await requireGuest(request, identity);
    const params = new URL(request.url).searchParams;
    const query = parseOrThrow(
      ownOrderListQuerySchema,
      Object.fromEntries(["limit", "cursor"].flatMap((k) => (params.has(k) ? [[k, params.get(k)]] : []))),
      "조회 조건을 확인해주세요.",
    );
    const { items, nextCursor } = await orders.listOwnOrders(session.id, query);
    return jsonResponse({ items: items.map(detailView), nextCursor });
  });
}
