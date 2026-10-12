"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Breadcrumb from "./Breadcrumb";
import PageHeading from "./PageHeading";
import { useCart } from "./CartProvider";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { type DeliveryHours } from "@/modules/delivery/hours";
import { checkoutIssue } from "@/features/checkout/validation";
import { customerCatalog } from "@/modules/catalog/customer-view";
import { publicSnapshotSchema } from "@/modules/catalog/public-schema";
import { orderRequestKey } from "@/features/orders/client";
import { preparePayment, paymentResultUrl, rememberPaymentCart } from "@/features/checkout/payment";
import { openTossPayment, type PayMethod } from "@/features/checkout/toss";
import { deliveryWindowKST, deliveryWindowUTC } from "@/modules/delivery/time";
import { money } from "@/modules/shared/format";
import { CardIcon, KakaoPayMark, TossMark } from "./icons/BrandMarks";

const PAY_METHODS: { key: PayMethod; label: string; className: string; icon: React.ReactNode }[] = [
  { key: "toss", label: "토스페이", className: "pay-toss", icon: <TossMark /> },
  { key: "kakaopay", label: "카카오페이", className: "pay-kakao", icon: <KakaoPayMark /> },
  { key: "card", label: "신용·체크카드", className: "pay-card", icon: <CardIcon /> },
];

export default function CheckoutView({ hours, clientKey }: { hours: DeliveryHours; clientKey: string | null }) {
  const params = useSearchParams();
  const router = useRouter();
  const { items, open } = useCart();
  const catalog = useCustomerCatalog();
  const { itemName, itemOptions, itemUnitPrice, deliveryFee } = catalog;

  const address = params.get("address") ?? "";
  const hasUTC = params.has("desiredStartAt") || params.has("desiredEndAt");
  const windowDisplay = hasUTC
    ? deliveryWindowKST(params.get("desiredStartAt") ?? "", params.get("desiredEndAt") ?? "")
    : { day: params.get("day") ?? "", timeLabel: params.get("time") ?? "" };
  const day = windowDisplay?.day ?? "";
  const timeLabel = windowDisplay?.timeLabel ?? "";

  const [method, setMethod] = useState<PayMethod>("toss");
  const [paying, setPaying] = useState(false);
  const [ordererName, setOrdererName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const paymentController = useRef<AbortController | null>(null);
  const submission = useRef<{ body: string; key: string } | null>(null);
  const standard = clientKey?.startsWith("test_gck_") ?? false;

  useEffect(() => () => paymentController.current?.abort(), []);

  const subtotal = items.reduce((n, i) => n + itemUnitPrice(i) * i.qty, 0);
  const fee = items.length ? deliveryFee(subtotal) : 0;
  const total = subtotal + fee;

  const delivery = { address, day, timeLabel, hours };
  // 시간은 확정 동작에서도 다시 확인한다. 초기 렌더에서는 시각 의존 검사 없이 상태만 표시한다.
  const unavailable = items.some((i) => !catalog.itemAvailable(i));
  const canPay = items.length > 0 && !unavailable && !paying && clientKey !== null;

  const pay = async () => {
    if (!canPay || pending.current) {
      return;
    }
    const controller = new AbortController();
    paymentController.current = controller;
    pending.current = true;
    setPaying(true);
    setError("");
    try {
      const response = await fetch("/api/catalog", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        throw Error("메뉴 상태를 확인하지 못했습니다. 다시 시도해주세요.");
      }
      const snapshot = publicSnapshotSchema.parse(await response.json());
      const latest = customerCatalog(snapshot);
      const issue = checkoutIssue(items, latest, delivery);
      if (issue) {
        setError(issue);
        return;
      }
      const latestSubtotal = items.reduce((sum, item) => sum + latest.itemUnitPrice(item) * item.qty, 0);
      const latestTotal = latestSubtotal + latest.deliveryFee(latestSubtotal);
      if (latestTotal !== total) {
        setError("메뉴 금액이 변경되었어요. 장바구니에서 금액을 확인해주세요.");
        return;
      }
      const deliveryWindow = deliveryWindowUTC(day, timeLabel);
      if (!deliveryWindow) {
        throw Error("받을 시간대를 다시 선택해주세요.");
      }
      if (!ordererName.trim() || !/^0\d[\d -]{7,27}$/.test(phone.trim())) {
        throw Error("받는 분의 이름과 연락처를 확인해주세요.");
      }
      const input = { ...deliveryWindow, address, ordererName: ordererName.trim(), phone: phone.trim(), items };
      const body = JSON.stringify(input);
      if (submission.current?.body !== body) {
        submission.current = { body, key: await orderRequestKey(input) };
      }
      const checkout = await preparePayment(input, submission.current.key);
      // An existing authentication must be reconciled instead of opening a second payment.
      if (checkout.paymentKey) {
        router.push(paymentResultUrl({ ...checkout, paymentKey: checkout.paymentKey }));
        return;
      }
      if (checkout.amount !== total) {
        throw new Error("메뉴 금액이 변경되었어요. 장바구니에서 금액을 확인해주세요.");
      }
      await rememberPaymentCart(checkout.orderId, items);
      const { loadTossPayments, ANONYMOUS } = await import("@tosspayments/tosspayments-sdk");
      const toss = await loadTossPayments(clientKey!);
      await openTossPayment({
        toss,
        standard,
        anonymous: ANONYMOUS,
        method,
        signal: controller.signal,
        request: {
          amount: checkout.amount,
          orderId: checkout.orderId,
          orderName: checkout.orderName,
          successUrl: window.location.origin + "/checkout/success",
          failUrl: window.location.origin + "/checkout/fail",
          customerName: ordererName.trim(),
        },
      });
    } catch (cause) {
      const canceled = typeof cause === "object" && cause !== null && "code" in cause && cause.code === "USER_CANCEL";
      setError(
        canceled
          ? "결제를 중단했어요. 장바구니는 그대로 보관했습니다."
          : cause instanceof Error
            ? cause.message
            : "결제를 확인하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      pending.current = false;
      setPaying(false);
    }
  };

  if (!items.length) {
    return (
      <main className="wrap pv-wrap">
        <Breadcrumb items={[["홈", "/"], ["결제"]]} />
        <p className="empty">담은 메뉴가 없어요.</p>
        <Link className="ghost-btn" href="/menu">
          메뉴 보러 가기
        </Link>
      </main>
    );
  }

  return (
    <main className="wrap pv-wrap checkout-wrap">
      <Breadcrumb items={[["홈", "/"], ["결제"]]} />
      <PageHeading>결제</PageHeading>
      <p className="auth-note">토스페이먼츠 테스트 결제입니다. 실제로 청구되지 않아요.</p>
      {!clientKey && <p role="alert">테스트 결제를 준비 중입니다. 잠시 후 다시 이용해주세요.</p>}

      {(error || unavailable) && (
        <div role="alert">
          <p>{error || "품절되거나 삭제된 메뉴·옵션이 있어요."}</p>
          <button type="button" className="ghost-btn" onClick={(e) => open(e.currentTarget)}>
            장바구니 확인
          </button>
        </div>
      )}
      <section className="surface mypage-section">
        <h2>주문 내용</h2>
        <ul className="order-item-lines checkout-lines">
          {items.map((i, idx) => (
            <li key={idx}>
              {itemName(i)}
              {itemOptions(i) && <span> · {itemOptions(i)}</span>}
              <span> × {i.qty}</span>
              <strong>{money(itemUnitPrice(i) * i.qty)}</strong>
            </li>
          ))}
        </ul>
        <div className="totals">
          <div>
            <span>상품 금액</span>
            <span>{money(subtotal)}</span>
          </div>
          <div>
            <span>배달비</span>
            <span>{fee === 0 ? "무료" : money(fee)}</span>
          </div>
          <div className="total">
            <span>합계</span>
            <span>{money(total)}</span>
          </div>
        </div>
      </section>

      <section className="surface mypage-section">
        <h2>배송 정보</h2>
        <p className="meta">
          {address} · {day} {timeLabel}
        </p>
        <div className="mypage-form">
          <label className="field">
            <span>받는 분</span>
            <input
              autoComplete="name"
              maxLength={50}
              value={ordererName}
              onChange={(event) => setOrdererName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>연락처</span>
            <input
              autoComplete="tel"
              inputMode="tel"
              maxLength={30}
              placeholder="010-1234-5678"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="surface mypage-section">
        <h2>결제 수단</h2>
        {standard ? (
          <p>카드·토스페이·카카오페이는 결제 창에서 선택해주세요.</p>
        ) : (
          <div className="pay-methods" role="radiogroup" aria-label="결제 수단">
            {PAY_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={method === m.key}
                aria-label={m.label}
                className={`${m.className}${method === m.key ? " active" : ""}`}
                onClick={() => setMethod(m.key)}
              >
                {m.icon}
                {m.key === "card" && m.label}
              </button>
            ))}
          </div>
        )}
        <p className="pay-redirect-note">결제하기를 누르면 토스페이먼츠 결제 창에서 안전하게 결제할 수 있어요.</p>
      </section>

      <button type="button" className="primary full form-btn checkout-pay-btn" disabled={!canPay} onClick={pay}>
        {money(total)} 결제하기
      </button>
    </main>
  );
}
