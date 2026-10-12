import "server-only";
import { z } from "zod";
import { AppError } from "@/modules/shared/errors";
import type { PaymentGateway } from "@/modules/payments/types";

export function tossTestConfig(env: NodeJS.ProcessEnv = process.env) {
  const clientKey = env.TOSS_CLIENT_KEY;
  const secretKey = env.TOSS_SECRET_KEY;
  if (!clientKey?.startsWith("test_ck_") || !secretKey?.startsWith("test_sk_")) {
    throw new AppError(503, "테스트 결제를 준비 중입니다. 잠시 후 다시 이용해주세요.");
  }
  return { clientKey, secretKey };
}

export function tossClientKey(): string | null {
  try {
    return tossTestConfig().clientKey;
  } catch {
    return null;
  }
}

const paymentSchema = z.object({
  paymentKey: z.string().min(1).max(200),
  orderId: z.string().max(64),
  totalAmount: z.number().int().positive().max(300_000_000),
  currency: z.string(),
  status: z.string(),
  method: z
    .string()
    .nullable()
    .transform((value) => value ?? ""),
  approvedAt: z.string().nullable(),
});

export function createTossGateway(fetcher: typeof fetch = fetch): PaymentGateway {
  async function request(path: string, body?: object, idempotencyKey?: string) {
    const { secretKey } = tossTestConfig();
    let response: Response;
    try {
      response = await fetcher("https://api.tosspayments.com/v1/payments" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Basic " + Buffer.from(secretKey + ":").toString("base64"),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AppError(502, "결제 승인 결과를 확인하지 못했습니다. 이 화면에서 다시 확인해주세요.");
    }
    if (!body && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      // Provider responses can contain merchant details. Never forward or log them.
      throw new AppError(
        response.status >= 500 ? 502 : 409,
        "결제를 승인하지 못했습니다. 이 화면에서 다시 확인해주세요.",
      );
    }
    const result = paymentSchema.safeParse(await response.json().catch(() => null));
    if (!result.success) {
      throw new AppError(502, "결제 승인 결과를 확인하지 못했습니다. 다시 확인해주세요.");
    }
    return result.data;
  }
  return {
    assertConfigured: () => {
      tossTestConfig();
    },
    lookup: (orderId) => request("/orders/" + encodeURIComponent(orderId)),
    async confirm(paymentKey, orderId, amount) {
      const payment = await request("/confirm", { paymentKey, orderId, amount }, "confirm-" + orderId);
      if (!payment) {
        throw new AppError(502, "결제 승인 결과를 확인하지 못했습니다.");
      }
      return payment;
    },
  };
}
