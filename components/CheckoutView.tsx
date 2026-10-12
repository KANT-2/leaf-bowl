"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Breadcrumb from "./Breadcrumb";
import PageHeading from "./PageHeading";
import { useAuth } from "./AuthProvider";
import { useCart } from "./CartProvider";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { type DeliveryHours } from "@/modules/delivery/hours";
import { dateValue, timeOptions } from "@/modules/delivery/slots";
import { checkoutIssue } from "@/features/checkout/validation";
import { customerCatalog } from "@/modules/catalog/customer-view";
import { publicSnapshotSchema } from "@/modules/catalog/public-schema";
import { orderRequestKey } from "@/features/orders/client";
import { preparePayment, paymentResultUrl, rememberPaymentCart } from "@/features/checkout/payment";
import { openTossPayment } from "@/features/checkout/toss";
import { deliveryWindowUTC } from "@/modules/delivery/time";
import { isCustom, isDrink } from "@/modules/cart/identity";
import { type CartItem } from "@/modules/cart/types";
import { money } from "@/modules/shared/format";
import { TossMark } from "./icons/BrandMarks";

export default function CheckoutView({ hours, clientKey }: { hours: DeliveryHours; clientKey: string | null }) {
  const router = useRouter();
  const { items, open } = useCart();
  const catalog = useCustomerCatalog();
  const { itemName, itemOptions, itemUnitPrice, deliveryFee, photoSrc, DRINKS, catalogConfig } = catalog;
  const { user } = useAuth();

  const savedAddresses = user?.addresses ?? [];
  const defaultAddr = user?.addresses.find((a) => a.isDefault);
  const defaultAddress = defaultAddr
    ? `${defaultAddr.address}${defaultAddr.detail ? `, ${defaultAddr.detail}` : ""}`
    : "";
  const [addressInput, setAddressInput] = useState<string | null>(null);
  const address = addressInput ?? defaultAddress;

  // 날짜·시간대는 결제 화면을 연 시각 기준으로 계산하고, 고른 값이 범위를 벗어나면 기본값으로 돌린다.
  const [openedAt] = useState(() => Date.now());
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const minDate = dateValue(openedAt, 0);
  const maxDate = dateValue(openedAt, 14);
  const day = date >= minDate && date <= maxDate ? date : dateValue(openedAt, 1);
  const options = timeOptions(day, openedAt, hours);
  const slot = options.find((o) => o.value === time) ?? options[0];
  const timeLabel = slot?.label ?? "";

  const [requestNote, setRequestNote] = useState(() => catalogConfig.deliveryRequestPresets[0] ?? "직접 입력");
  const [customNote, setCustomNote] = useState("");
  const isCustomNote = requestNote === "직접 입력";

  const [paying, setPaying] = useState(false);
  const [ordererName, setOrdererName] = useState("");
  const [phone, setPhone] = useState("");
  const loadMyInfo = () => {
    if (!user) {
      return;
    }
    setOrdererName(user.name);
    setPhone(user.phone);
    const addr = defaultAddr ?? savedAddresses[0];
    if (addr) {
      setAddressInput(`${addr.address}${addr.detail ? `, ${addr.detail}` : ""}`);
    }
  };
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const paymentController = useRef<AbortController | null>(null);
  const submission = useRef<{ body: string; key: string } | null>(null);
  const standard = clientKey?.startsWith("test_gck_") ?? false;

  useEffect(() => () => paymentController.current?.abort(), []);

  const subtotal = items.reduce((n, i) => n + itemUnitPrice(i) * i.qty, 0);
  const fee = items.length ? deliveryFee(subtotal) : 0;
  const total = subtotal + fee;

  /** 장바구니 줄의 사진. 메뉴·내 취향 볼은 참고 사진, 음료는 음료 사진을 쓴다. */
  const itemPhoto = (item: CartItem) => {
    if (isDrink(item)) {
      return DRINKS[item.drink]?.image || "/images/hero-cutout.png";
    }
    if (isCustom(item)) {
      return photoSrc(item.photo);
    }
    return photoSrc(item.id);
  };

  const delivery = { address, day, timeLabel, hours };
  // 시간은 확정 동작에서도 다시 확인한다. 초기 렌더에서는 시각 의존 검사 없이 상태만 표시한다.
  const unavailable = items.some((i) => !catalog.itemAvailable(i));
  const canPay = items.length > 0 && !unavailable && !paying && clientKey !== null && agree;

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
        method: "toss",
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
      <div className="checkout-grid">
        <div className="checkout-main">
          <section className="surface mypage-section">
            <h2>배송 정보</h2>
            <div className="mypage-form">
              <label className="field">
                <span>배달 주소</span>
                {savedAddresses.length > 0 && (
                  <div className="address-chips" role="group" aria-label="저장된 배송지에서 고르기">
                    {savedAddresses.map((a) => {
                      const full = `${a.address}${a.detail ? `, ${a.detail}` : ""}`;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className={address === full ? "active" : ""}
                          onClick={() => setAddressInput(full)}
                        >
                          {a.label || "배송지"}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  placeholder="배달 주소를 입력해주세요"
                  autoComplete="street-address"
                  value={address}
                  onChange={(event) => setAddressInput(event.target.value)}
                />
              </label>
              <div className="two-fields">
                <label className="field">
                  <span>받을 날짜</span>
                  <input
                    type="date"
                    required
                    min={minDate}
                    max={maxDate}
                    value={day}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>시간대</span>
                  <select required value={slot?.value ?? ""} onChange={(event) => setTime(event.target.value)}>
                    {options.length ? (
                      options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))
                    ) : (
                      <option value="">오늘은 마감되었어요. 다른 날짜를 선택해주세요.</option>
                    )}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>배송 요청사항</span>
                <select value={requestNote} onChange={(event) => setRequestNote(event.target.value)}>
                  {catalogConfig.deliveryRequestPresets.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="직접 입력">직접 입력</option>
                </select>
              </label>
              {isCustomNote && (
                <label className="field">
                  <span>요청사항 직접 입력</span>
                  <input maxLength={60} value={customNote} onChange={(event) => setCustomNote(event.target.value)} />
                </label>
              )}
              <div className="checkout-section-head">
                <h3>받는 사람 정보</h3>
                {user && (user.name || user.phone) && (
                  <button type="button" className="ghost-btn" onClick={loadMyInfo}>
                    내 정보 불러오기
                  </button>
                )}
              </div>
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
            <div className="pay-toss-panel">
              <TossMark />
              <div>
                <p className="pay-toss-title">토스페이먼츠로 결제</p>
                <p className="pay-toss-desc">카드·계좌이체·간편결제는 결제 창에서 바로 선택할 수 있어요.</p>
              </div>
            </div>
            <p className="pay-redirect-note">결제하기를 누르면 토스페이먼츠 결제 창에서 안전하게 결제할 수 있어요.</p>
          </section>
        </div>

        <aside className="surface mypage-section checkout-summary">
          <h2>주문 내역</h2>
          <ul className="order-item-lines">
            {items.map((item, idx) => (
              <li key={idx} className="order-line">
                <div className="order-line-image">
                  <Image src={itemPhoto(item)} alt="" width={96} height={96} unoptimized />
                </div>
                <div className="order-line-info">
                  <div>
                    {itemName(item)}
                    {itemOptions(item) && <span> · {itemOptions(item)}</span>}
                    <span> × {item.qty}</span>
                  </div>
                </div>
                <strong>{money(itemUnitPrice(item) * item.qty)}</strong>
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

          <label className="checkout-agree">
            <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
            주문 내용을 확인했으며 결제 진행에 동의합니다.
          </label>

          <button type="button" className="primary full form-btn checkout-pay-btn" disabled={!canPay} onClick={pay}>
            {agree ? `${money(total)} 결제하기` : "약관에 동의해주세요"}
          </button>
        </aside>
      </div>
    </main>
  );
}
