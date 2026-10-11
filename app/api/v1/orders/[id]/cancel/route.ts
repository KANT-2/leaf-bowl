import { requireGuest } from "@/modules/identity/guard";
import { services } from "@/application/container";
import { cancelView } from "@/modules/orders/presenter";
import { cancelOrderSchema, orderIdSchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/infrastructure/http/response";

/** 접수·확인 상태에서만 취소할 수 있다. 이미 취소된 주문의 재요청은 현재 결과를 그대로 돌려준다 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    assertSameOrigin(request);
    const { identity, orders } = services();
    const session = await requireGuest(request, identity);
    const { id } = await params;
    if (!orderIdSchema.safeParse(id).success) {
      throw new AppError(404, "주문을 찾을 수 없습니다.");
    }
    const { reason } = parseOrThrow(cancelOrderSchema, await readJsonBody(request, 2_000), "취소 사유를 확인해주세요.");
    return jsonResponse(cancelView(await orders.cancelOrder(session.id, id, reason)));
  });
}
