import { requireAdmin } from "@/modules/identity/guard";
import { services } from "@/application/container";
import { statusView } from "@/modules/orders/presenter";
import { changeStatusSchema, orderIdSchema } from "@/modules/orders/schema";
import { AppError } from "@/modules/shared/errors";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/infrastructure/http/response";

/** 주문 상태 변경. version 이 오래되었거나 허용되지 않은 순서면 409 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    assertSameOrigin(request);
    const { identity, orders } = services();
    const admin = await requireAdmin(request, identity);
    const { id } = await params;
    if (!orderIdSchema.safeParse(id).success) {
      throw new AppError(404, "주문을 찾을 수 없습니다.");
    }
    const input = parseOrThrow(
      changeStatusSchema,
      await readJsonBody(request, 2_000),
      "상태 변경 내용을 확인해주세요.",
    );
    return jsonResponse(statusView(await orders.changeStatus(admin.adminUserId!, id, input)));
  });
}
