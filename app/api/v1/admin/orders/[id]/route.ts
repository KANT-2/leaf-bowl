import { services } from "@/application/container";
import { fastapiAdminEnabled, forwardAdminRequest } from "@/application/fastapi-admin-bridge";
import { jsonResponse, run } from "@/infrastructure/http/response";
import { requireAdmin } from "@/modules/identity/guard";
import { adminDetailView } from "@/modules/orders/presenter";
import { orderIdSchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";

/** 관리자 주문 상세: 연락처와 상태 변경 이력 포함 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await params;
    if (!orderIdSchema.safeParse(id).success) {
      throw new AppError(404, "주문을 찾을 수 없습니다.");
    }
    if (fastapiAdminEnabled()) {
      return forwardAdminRequest(request, `/api/admin/orders/${encodeURIComponent(id)}`);
    }
    const { identity, orders } = services();
    await requireAdmin(request, identity);
    return jsonResponse(adminDetailView(await orders.getOrderForAdmin(id)));
  });
}
