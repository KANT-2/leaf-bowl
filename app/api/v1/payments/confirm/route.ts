import { services } from "@/application/container";
import { requireGuest } from "@/modules/identity/guard";
import { confirmPaymentSchema } from "@/modules/payments/schema";
import { createdView } from "@/modules/orders/presenter";
import { AppError } from "@/modules/shared/errors";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/infrastructure/http/response";

export async function POST(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    const { identity, payments, limits } = services();
    const session = await requireGuest(request, identity);
    limits.order.hit(session.id);
    if (!payments) {
      throw new AppError(503, "결제를 준비 중입니다.");
    }
    const input = parseOrThrow(confirmPaymentSchema, await readJsonBody(request), "결제 승인 정보를 확인해주세요.");
    return jsonResponse(createdView(await payments.confirm(session.id, input)));
  });
}
