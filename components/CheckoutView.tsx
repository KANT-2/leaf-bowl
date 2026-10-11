"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import Breadcrumb from "./Breadcrumb";
import PageHeading from "./PageHeading";
import { useCart } from "./CartProvider";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import type { DeliveryHours } from "@/lib/data/delivery";
import { checkoutIssue } from "@/lib/checkout-validation";
import { customerCatalog } from "@/lib/customer/catalog";
import type { Snapshot } from "@/lib/admin/catalog";
import { recordOrder } from "@/lib/orders";
import { deliveryFee, money } from "@/lib/products";
import { CardIcon, KakaoPayMark, TossMark } from "./icons/BrandMarks";

type PayMethod = "toss" | "kakaopay" | "card";

const PAY_METHODS: { key: PayMethod; label: string; className: string; icon: React.ReactNode }[] = [
  { key: "toss", label: "토스페이먼츠", className: "pay-toss", icon: <TossMark /> },
  { key: "kakaopay", label: "카카오페이", className: "pay-kakao", icon: <KakaoPayMark /> },
  { key: "card", label: "신용·체크카드", className: "pay-card", icon: <CardIcon /> },
];

const formatCardNumber = (v: string) =>
  v
    .replace(/[^0-9]/g, "")
    .slice(0, 16)
    .replace(/(.{4})(?=.)/g, "$1 ");

const formatExpiry = (v: string) => {
  const digits = v.replace(/[^0-9]/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

export default function CheckoutView({ hours }: { hours: DeliveryHours }) {
  const params = useSearchParams();
  const { items, clear, open } = useCart();
  const catalog = useCustomerCatalog();
  const { itemName, itemOptions, itemUnitPrice } = catalog;

  const address = params.get("address") ?? "";
  const day = params.get("day") ?? "";
  const timeLabel = params.get("time") ?? "";

  const [method, setMethod] = useState<PayMethod>("toss");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [done, setDone] = useState(false);
  const [doneTotal, setDoneTotal] = useState(0);

  const subtotal = items.reduce((n, i) => n + itemUnitPrice(i) * i.qty, 0);
  const fee = items.length ? deliveryFee(subtotal) : 0;
  const total = subtotal + fee;

  const cardValid =
    cardNumber.replace(/\s/g, "").length >= 14 &&
    /^\d{2}\/\d{2}$/.test(cardExpiry) &&
    /^\d{3}$/.test(cardCvc);
  const delivery = { address, day, timeLabel, hours };
  // 시간은 확정 동작에서도 다시 확인한다. 초기 렌더에서는 시각 의존 검사 없이 상태만 표시한다.
  const unavailable = items.some((i) => !catalog.itemAvailable(i));
  const canPay = items.length > 0 && !unavailable && !paying && (method !== "card" || cardValid);

  const pay = async () => {
    if (!canPay || pending.current) return;
    pending.current = true;
    setPaying(true);
    setError("");
    try {
      const response = await fetch("/api/catalog", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw Error("메뉴 상태를 확인하지 못했습니다. 다시 시도해주세요.");
      const snapshot: Snapshot = await response.json();
      const latest = customerCatalog(snapshot);
      const issue = checkoutIssue(items, latest, delivery);
      if (issue) { setError(issue); return; }
      const latestSubtotal = items.reduce((sum, item) => sum + latest.itemUnitPrice(item) * item.qty, 0);
      const latestTotal = latestSubtotal + deliveryFee(latestSubtotal);
      if (latestTotal !== total) {
        setError("메뉴 금액이 변경되었어요. 장바구니에서 금액을 확인해주세요.");
        return;
      }
      recordOrder({
        day, timeLabel, address, total: latestTotal,
        items: items.map((item) => ({ name: latest.itemName(item), options: latest.itemOptions(item), qty: item.qty, unitPrice: latest.itemUnitPrice(item) })),
      });
      setDoneTotal(latestTotal);
      clear();
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "주문을 확인하지 못했습니다. 다시 시도해주세요.");
    } finally {
      pending.current = false;
      setPaying(false);
    }
  };

  if (done) {
    return (
      <main className="wrap pv-wrap checkout-wrap">
        <div className="checkout-done">
          <div className="success-icon" aria-hidden="true">✓</div>
          <h1>결제가 완료되었어요</h1>
          <p>
            {money(doneTotal)} 결제 · {day} {timeLabel}
          </p>
          <p className="demo-note">체험용 결제입니다. 실제로 청구되지 않았어요.</p>
          <div className="form-actions-stack">
            <Link className="primary full form-btn" href="/mypage">
              마이페이지에서 주문 확인
            </Link>
            <div className="form-actions-row">
              <Link className="text-btn" href="/menu">
                메뉴 더 보기
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
      <p className="auth-note">체험용 결제 화면입니다. 실제로 청구되지 않아요.</p>

      {(error || unavailable) && <div role="alert"><p>{error || "품절되거나 삭제된 메뉴·옵션이 있어요."}</p><button type="button" className="ghost-btn" onClick={(e) => open(e.currentTarget)}>장바구니 확인</button></div>}
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
      </section>

      <section className="surface mypage-section">
        <h2>결제 수단</h2>
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
        {method === "card" ? (
          <div className="mypage-form card-form">
            <label className="field">
              <span>카드 번호</span>
              <input
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              />
            </label>
            <div className="two-fields">
              <label className="field">
                <span>유효기간 (MM/YY)</span>
                <input
                  inputMode="numeric"
                  placeholder="MM/YY"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                />
              </label>
              <label className="field">
                <span>CVC</span>
                <input
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="000"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                />
              </label>
            </div>
          </div>
        ) : (
          <p className="pay-redirect-note">
            {method === "toss" ? "토스페이먼츠" : "카카오페이"} 결제 창으로 이동합니다 (체험용).
          </p>
        )}
      </section>

      <button type="button" className="primary full form-btn checkout-pay-btn" disabled={!canPay} onClick={pay}>
        {money(total)} 결제하기
      </button>
    </main>
  );
}
