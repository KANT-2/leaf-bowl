import { requireAdmin } from "@/modules/identity/guard";
import { services } from "@/modules/container";
import { adminDetailView } from "@/modules/orders/presenter";
import { orderIdSchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";
import { jsonResponse, run } from "@/modules/shared/http";

/** 관리자 주문 상세: 연락처·처리 이력 포함 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { identity, orders } = services();
    await requireAdmin(request, identity);
    const { id } = await params;
    if (!orderIdSchema.safeParse(id).success) throw new AppError(404, "주문을 찾을 수 없습니다.");
    return jsonResponse(adminDetailView(await orders.getOrderForAdmin(id)));
  });
}
