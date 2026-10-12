import type { TossPaymentsSDK } from "@tosspayments/tosspayments-sdk";

export type PayMethod = "toss" | "kakaopay" | "card";

type PaymentRequest = {
  orderId: string;
  orderName: string;
  amount: number;
  customerName: string;
  successUrl: string;
  failUrl: string;
};

export async function openTossPayment({
  toss,
  standard,
  anonymous,
  method,
  request,
  signal,
}: {
  toss: TossPaymentsSDK;
  standard: boolean;
  anonymous: string;
  method: PayMethod;
  request: PaymentRequest;
  signal: AbortSignal;
}) {
  signal.throwIfAborted();
  const { amount, ...details } = request;
  if (!standard) {
    return toss.payment({ customerKey: request.orderId }).requestPayment({
      ...details,
      method: "CARD",
      amount: { currency: "KRW", value: amount },
      card:
        method === "card"
          ? { flowMode: "DEFAULT" }
          : { flowMode: "DIRECT", easyPay: method === "toss" ? "토스페이" : "카카오페이" },
    });
  }

  const widgets = toss.widgets({ customerKey: anonymous });
  await widgets.setAmount({ currency: "KRW", value: amount });
  signal.throwIfAborted();
  const paymentWindow = await widgets.renderPaymentWindow({ orderName: request.orderName });
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let requesting = false;
    const finish = async (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", abort);
      await paymentWindow.destroy().catch(() => {});
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const abort = () => {
      void finish(new Error("결제창을 닫았습니다."));
    };
    signal.addEventListener("abort", abort, { once: true });
    paymentWindow.on("cancel", async () => {
      await finish(Object.assign(new Error("결제를 중단했어요."), { code: "USER_CANCEL" }));
    });
    paymentWindow.on("paymentRequest", async ({ paymentMethod }) => {
      if (settled || requesting) {
        return;
      }
      // Deferred payments and other methods need separate settlement flows.
      if (!["CARD", "TOSSPAY", "KAKAOPAY"].includes(paymentMethod.code)) {
        await finish(new Error("이번 테스트는 카드·토스페이·카카오페이를 선택해주세요."));
        return;
      }
      requesting = true;
      try {
        await widgets.requestPayment(details);
        await finish();
      } catch (error) {
        await finish(error);
      }
    });
    if (signal.aborted) {
      abort();
    }
  });
}
