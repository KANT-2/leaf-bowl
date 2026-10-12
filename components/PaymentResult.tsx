"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";
import { confirmPayment, consumePaymentCart } from "@/features/checkout/payment";
import { clearOrderRequestKey } from "@/features/orders/client";
import { confirmPaymentSchema } from "@/modules/payments/schema";
import { money } from "@/modules/shared/format";

export default function PaymentResult({ failed = false }: { failed?: boolean }) {
  const params = useSearchParams();
  const { items, clear, open } = useCart();
  const [attempt, setAttempt] = useState(0);
  const [order, setOrder] = useState<{ id: string; total: number } | null>(null);
  const [error, setError] = useState("");
  const orderId = params.get("orderId");
  const paymentKey = params.get("paymentKey");
  const rawAmount = params.get("amount");
  const validAmount = rawAmount !== null && /^\d+$/.test(rawAmount);
  const amount = validAmount ? Number(rawAmount) : NaN;

  useEffect(() => {
    if (failed || order) {
      return;
    }
    const input = confirmPaymentSchema.safeParse({ orderId, paymentKey, amount });
    if (!input.success) {
      return;
    }
    let disposed = false;
    confirmPayment(input.data)
      .then(async (result) => {
        if (disposed) {
          return;
        }
        const consumed = await consumePaymentCart(input.data.orderId, items);
        if (disposed) {
          return;
        }
        if (consumed) {
          clearOrderRequestKey();
          clear();
        }
        setOrder(result);
      })
      .catch((cause) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "결제 결과를 확인하지 못했습니다.");
        }
      });
    return () => {
      disposed = true;
    };
  }, [failed, orderId, paymentKey, amount, attempt, clear, items, order]);

  const invalid = !failed && !confirmPaymentSchema.safeParse({ orderId, paymentKey, amount }).success;
  return (
    <main className="wrap pv-wrap checkout-wrap">
      <div className="checkout-done">
        {order && (
          <div className="success-icon" aria-hidden="true">
            ✓
          </div>
        )}
        <h1>
          {order
            ? "주문이 접수되었어요"
            : failed
              ? "결제를 완료하지 못했어요"
              : error || invalid
                ? "결제 결과를 확인해주세요"
                : "결제 승인을 확인하고 있어요"}
        </h1>
        {order ? (
          <p>
            {money(order.total)} · 주문번호 {order.id}
          </p>
        ) : failed ? (
          <p>결제가 중단되었거나 실패했어요. 장바구니는 그대로 보관했습니다.</p>
        ) : (
          <p role={error || invalid ? "alert" : "status"}>
            {invalid
              ? "결제 정보가 올바르지 않습니다. 매장에 문의해주세요."
              : error || "화면을 닫지 말고 잠시 기다려주세요."}
          </p>
        )}
        <div className="form-actions-stack">
          {order ? (
            <Link className="primary full form-btn" href="/mypage">
              마이페이지에서 주문 확인
            </Link>
          ) : failed ? (
            <button className="primary full form-btn" type="button" onClick={(event) => open(event.currentTarget)}>
              장바구니에서 다시 결제
            </button>
          ) : error && !invalid ? (
            <button
              className="primary full form-btn"
              type="button"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              승인 결과 다시 확인
            </button>
          ) : null}
          <Link className="text-btn" href={order || failed ? "/menu" : "/mypage"}>
            {order || failed ? "메뉴 더 보기" : "주문 내역 확인"}
          </Link>
        </div>
      </div>
    </main>
  );
}
