import { requireGuest } from "@/modules/identity/guard";
import { services } from "@/application/container";
import { detailView } from "@/modules/orders/presenter";
import { orderIdSchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";
import { jsonResponse, run } from "@/infrastructure/http/response";

/** 본인 주문 조회. 다른 사람의 주문은 404 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { identity, orders } = services();
    const session = await requireGuest(request, identity);
    const { id } = await params;
    if (!orderIdSchema.safeParse(id).success) throw new AppError(404, "주문을 찾을 수 없습니다.");
    return jsonResponse(detailView(await orders.getOrder(session.id, id)));
  });
}
