import { services } from "@/application/container";
import { requireGuest } from "@/modules/identity/guard";
import { createOrderSchema, idempotencyKeySchema } from "@/modules/orders/schema";
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
    const key = parseOrThrow(idempotencyKeySchema, request.headers.get("idempotency-key"), "요청 번호를 확인해주세요.");
    const input = parseOrThrow(createOrderSchema, await readJsonBody(request), "주문 내용을 확인해주세요.");
    return jsonResponse(await payments.prepare(session.id, key, input));
  });
}
