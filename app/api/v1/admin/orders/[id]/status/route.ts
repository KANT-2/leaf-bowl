import { services } from "@/application/container";
import { fastapiAdminEnabled, forwardAdminRequest } from "@/application/fastapi-admin-bridge";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/infrastructure/http/response";
import { requireAdmin } from "@/modules/identity/guard";
import { statusView } from "@/modules/orders/presenter";
import { changeStatusSchema, orderIdSchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";

/** 관리자 상태 변경: Next.js 브라우저 계약 유지, FastAPI JWT는 서버에서만 사용. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    assertSameOrigin(request);
    const { id } = await params;
    if (!orderIdSchema.safeParse(id).success) {
      throw new AppError(404, "주문을 찾을 수 없습니다.");
    }
    const input = parseOrThrow(
      changeStatusSchema,
      await readJsonBody(request, 2_000),
      "상태 변경 내용을 확인해주세요.",
    );
    if (fastapiAdminEnabled()) {
      return forwardAdminRequest(request, `/api/admin/orders/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: input,
      });
    }
    const { identity, orders } = services();
    const admin = await requireAdmin(request, identity);
    return jsonResponse(statusView(await orders.changeStatus(admin.adminUserId!, id, input)));
  });
}
