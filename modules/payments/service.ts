import { AppError } from "@/modules/shared/errors";
import { requestHash } from "@/modules/orders/request-hash";
import type { CreateOrderInput } from "@/modules/orders/schema";
import type { ConfirmPaymentInput } from "./schema";
import type { ApprovedPayment, PaymentCheckout, PaymentGateway, PaymentsRepository } from "./types";

export function assertApprovedPayment(checkout: PaymentCheckout, payment: ApprovedPayment) {
  if (
    payment.orderId !== checkout.id ||
    payment.paymentKey !== checkout.paymentKey ||
    payment.totalAmount !== Number(checkout.amount) ||
    payment.currency !== "KRW" ||
    payment.status !== "DONE" ||
    !["카드", "간편결제"].includes(payment.method) ||
    !payment.approvedAt ||
    !Number.isFinite(Date.parse(payment.approvedAt))
  ) {
    throw new AppError(409, "결제 승인 정보가 주문과 일치하지 않습니다. 매장에 문의해주세요.");
  }
}

export function createPaymentsService({
  repository,
  gateway,
  now = () => new Date(),
}: {
  repository: PaymentsRepository;
  gateway: PaymentGateway;
  now?: () => Date;
}) {
  async function ownCheckout(sessionId: string, id: string) {
    const checkout = await repository.findById(id);
    if (!checkout || checkout.customerSessionId !== sessionId) {
      throw new AppError(404, "결제할 주문을 찾을 수 없습니다.");
    }
    return checkout;
  }

  return {
    async prepare(sessionId: string, key: string, input: CreateOrderInput) {
      gateway.assertConfigured();
      const hash = requestHash(input);
      let checkout = await repository.prepare(sessionId, key, hash, input, now());
      if (checkout.requestHash !== hash) {
        throw new AppError(409, "같은 요청 번호로 다른 결제 내용이 이미 있습니다.");
      }
      if (checkout.paymentKey && !checkout.orderId) {
        const payment = await gateway.lookup(checkout.id);
        // Only a provider-confirmed terminal result allows a fresh payment attempt.
        // Unknown results and timeouts must keep the original approval recoverable.
        if (
          payment?.paymentKey === checkout.paymentKey &&
          payment.orderId === checkout.id &&
          payment.totalAmount === Number(checkout.amount) &&
          payment.currency === "KRW" &&
          ["ABORTED", "EXPIRED", "CANCELED"].includes(payment.status) &&
          (await repository.retire(checkout.id))
        ) {
          checkout = await repository.prepare(sessionId, key, hash, input, now());
        }
      }
      if (!checkout.paymentKey && checkout.expiresAt <= now()) {
        throw new AppError(409, "결제 대기 시간이 지났습니다. 배송 시간을 다시 선택해주세요.");
      }
      return {
        orderId: checkout.id,
        amount: Number(checkout.amount),
        orderName: checkout.orderSnapshot.items
          .map((item) => item.name)
          .join(" · ")
          .slice(0, 100),
        paymentKey: checkout.paymentKey,
        confirmedOrderId: checkout.orderId,
        expiresAt: checkout.expiresAt.toISOString(),
      };
    },

    async confirm(sessionId: string, input: ConfirmPaymentInput) {
      gateway.assertConfigured();
      const original = await ownCheckout(sessionId, input.orderId);
      if (original.amount !== BigInt(input.amount)) {
        throw new AppError(400, "결제 금액이 주문 금액과 일치하지 않습니다.");
      }
      if (original.paymentKey && original.paymentKey !== input.paymentKey) {
        throw new AppError(409, "이미 다른 결제 정보로 확인 중인 주문입니다.");
      }
      if (original.orderId) {
        const order = await repository.findOrder(original.orderId);
        if (!order) {
          throw new AppError(503, "접수한 주문을 확인하지 못했습니다. 다시 확인해주세요.");
        }
        return order;
      }
      // Bind once before any external mutation. Retries can only approve this same payment.
      const checkout = await repository.bindPaymentKey(original.id, input.paymentKey, now());
      let payment = await gateway.lookup(checkout.id);
      if (!payment || payment.status === "IN_PROGRESS" || payment.status === "READY") {
        try {
          payment = await gateway.confirm(input.paymentKey, checkout.id, Number(checkout.amount));
        } catch (error) {
          // A timeout or simultaneous request can hide a successful approval.
          const recovered = await gateway.lookup(checkout.id);
          if (recovered?.status !== "DONE") {
            throw error;
          }
          payment = recovered;
        }
      }
      assertApprovedPayment(checkout, payment);
      // Only database work is retried here; an external approval never runs in a DB transaction.
      return repository.complete(checkout.id, payment);
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
