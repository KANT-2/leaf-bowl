"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useCart } from "./CartProvider";
import FoodImage from "./FoodImage";
import { useToast } from "./ToastProvider";
import { dateValue, timeOptions, isAtLeast30MinAhead } from "@/lib/delivery-slots";
import type { DeliveryHours } from "@/lib/data/delivery";
import { isCustom, isDrink, itemKey, withChoice } from "@/lib/cart";
import { optionChoices, type CustomerCatalog } from "@/lib/customer/catalog";
import { dressingKey, drinkKey } from "@/lib/cart-identifiers";
import type { CartItem } from "@/lib/storage";
import {
  FREE_DELIVERY_FROM,
  MIN_DELIVERY_ORDER,
  deliveryFee,
  money,
} from "@/lib/products";

const FOCUSABLE =
  "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)";

export default function CartDrawer({ hours }: { hours: DeliveryHours }) {
  const { isOpen, openedAt, close } = useCart();
  const drawer = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // 열려 있는 동안: 본문 스크롤 잠금, Esc 로 닫기, Tab 순환, 닫기 버튼에 포커스
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("lock");
    const focusTimer = setTimeout(
      () => closeBtn.current?.focus({ preventScroll: true }),
      60,
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !drawer.current) return;
      const f = [
        ...drawer.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (!drawer.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      document.body.classList.remove("lock");
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  return (
    <>
      <div
        className={`scrim${isOpen ? " show" : ""}`}
        onClick={() => close()}
        aria-hidden="true"
      />
      <aside
        ref={drawer}
        className={`drawer${isOpen ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="장바구니"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        {openedAt !== null && (
          <CartBody openedAt={openedAt} hours={hours} closeBtn={closeBtn} />
        )}
      </aside>
    </>
  );
}

interface ChoiceSlot {
  /** 옵션 그룹 id. null 이면 예전 방식(dressing 번호) 줄 */
  groupId: string | null;
  /** 화면에 쓸 이름 (예: "드레싱") */
  label: string;
  value: string;
  choices: { value: string; name: string; available: boolean }[];
}

/** 장바구니 줄에서 바꿀 수 있는 단일 선택 옵션(드레싱 등). 없으면 null */
function choiceSlot(i: CartItem, cat: CustomerCatalog): ChoiceSlot | null {
  if (isDrink(i)) return null;
  if (!isCustom(i) && i.optionSelections) {
    const group = cat.groupsFor(i.id).find((g) => !g.multiple);
    if (!group) return null;
    const value = i.optionSelections[group.id]?.[0] ?? "";
    const list =
      group.source === "custom"
        ? group.choices
        : optionChoices(cat.catalog, group.source);
    const choices = list.map((c) => ({
      value: c.id,
      name: c.name,
      available: true,
    }));
    // 품절 등으로 목록에서 빠진 현재 선택도 보이게 둔다 (고를 수는 없음).
    if (value && !choices.some((c) => c.value === value)) {
      const old =
        cat.catalog.products.find((p) => p.id === value) ??
        group.choices.find((c) => c.id === value);
      choices.push({ value, name: old?.name || "판매 종료", available: false });
    }
    return {
      groupId: group.id,
      label: group.name.replace(/\s*선택$/, ""),
      value,
      choices,
    };
  }
  if (!dressingKey(i)) return null;
  return {
    groupId: null,
    label: "드레싱",
    value: dressingKey(i)!,
    choices: cat.DRESSINGS.flatMap((d) =>
      d.name
        ? [{ value: d.id, name: d.name, available: d.available }]
        : [],
    ),
  };
}

/** "드레싱" → "드레싱으로", "소스" → "소스로" (받침이 없거나 ㄹ 받침이면 "로") */
function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const jong = code % 28;
  return word + (jong === 0 || jong === 8 ? "로" : "으로");
}

/** 음료 줄에 쓰는 썸네일 (카탈로그 음료 사진, 없으면 컵 그림) */
function DrinkThumb({ src }: { src?: string }) {
  return (
    <span className="drink-thumb" aria-hidden="true">
      {src ? (
        <Image src={src} alt="" width={64} height={64} />
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 7h12l-1.4 12.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 7Z" />
          <path d="M5 7h14M13 7l2-4" />
        </svg>
      )}
    </span>
  );
}

interface BodyProps {
  openedAt: number;
  hours: DeliveryHours;
  closeBtn: React.RefObject<HTMLButtonElement | null>;
}

function CartBody({ openedAt, hours, closeBtn }: BodyProps) {
  const cat = useCustomerCatalog();
  const router = useRouter();
  const {
    itemAllergens,
    itemName,
    itemOptions,
    itemUnitPrice,
    itemAvailable,
    DRINKS,
  } = cat;
  const {
    items,
    count,
    update,
    remove,
    close,
    addDrink,
    changeChoice,
    addVariant,
  } = useCart();
  const toast = useToast();
  // "다른 드레싱으로"를 누른 뒤 새 줄의 선택 칸으로 포커스를 옮기기 위한 위치
  const focusLine = useRef<number | null>(null);

  /** 같은 샐러드를 아직 담지 않은 다른 선택지(품절 제외)로 1개 더 담는다. */
  const addOther = (index: number, slot: ChoiceSlot) => {
    const cur = items[index];
    const taken = new Set(items.map(itemKey));
    const pick = slot.choices.find(
      (c) =>
        c.available &&
        !taken.has(itemKey(withChoice(cur, slot.groupId, c.value))),
    );
    if (!pick) {
      toast(
        `고를 수 있는 ${slot.label}이(가) 모두 담겨 있어요. 수량을 늘려주세요`,
      );
      return;
    }
    focusLine.current = addVariant(index, slot.groupId, pick.value);
  };

  useEffect(() => {
    const at = focusLine.current;
    if (at === null) return;
    focusLine.current = null;
    document.getElementById(`choice-${at}`)?.focus();
  }, [items]);
  const { user } = useAuth();
  const defaultAddr = user?.addresses.find((a) => a.isDefault);
  const defaultAddress = defaultAddr
    ? `${defaultAddr.address}${defaultAddr.detail ? `, ${defaultAddr.detail}` : ""}`
    : "";
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // 아직 직접 입력하지 않았으면(null) 기본 배송지를 보여준다.
  const [addressInput, setAddressInput] = useState<string | null>(null);
  const address = addressInput ?? defaultAddress;
  const setAddress = (v: string) => setAddressInput(v);
  const [ack, setAck] = useState(false);

  // 날짜·시간대는 드로어를 연 시각 기준으로 계산하고, 고른 값이 범위를 벗어나면 기본값으로 돌린다.
  const minDate = dateValue(openedAt, 0);
  const maxDate = dateValue(openedAt, 14);
  const day =
    date >= minDate && date <= maxDate ? date : dateValue(openedAt, 1);
  const options = timeOptions(day, openedAt, hours);
  const slot = options.find((o) => o.value === time) ?? options[0];

  const unavailable = items.some((i) => !itemAvailable(i));
  const subtotal = items.reduce((n, i) => n + itemUnitPrice(i) * i.qty, 0);
  const fee = items.length ? deliveryFee(subtotal) : 0;
  // 배달 주문이 안 되는 이유 (없으면 빈 문자열)
  const deliveryIssue = !items.length
    ? ""
    : subtotal < MIN_DELIVERY_ORDER
      ? `배달은 ${money(MIN_DELIVERY_ORDER)} 이상부터 가능해요. ${money(MIN_DELIVERY_ORDER - subtotal)} 더 담아주세요.`
      : "";

  const changeQty = (
    e: React.MouseEvent<HTMLButtonElement>,
    index: number,
    delta: number,
  ) => {
    const next = items[index].qty + delta;
    update(index, next);
    // 이번 클릭으로 버튼이 비활성화되면 반대쪽 수량 버튼으로 포커스를 옮긴다.
    if (next <= 1 || next >= 99) {
      const other =
        e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
          `[data-delta="${-delta}"]`,
        );
      other?.focus({ preventScroll: true });
    }
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (unavailable) {
      toast("품절되거나 삭제된 메뉴·옵션을 제거해주세요.");
      return;
    }
    if (!items.length || deliveryIssue) return;
    if (!slot) {
      toast("받을 시간대를 선택해주세요");
      return;
    }
    if (!isAtLeast30MinAhead(day, slot.value)) {
      toast("현재 시간 이후의 시간대를 선택해주세요");
      return;
    }
    router.push(
      `/checkout?${new URLSearchParams({ address, day, time: slot.label }).toString()}`,
    );
    close(false);
  };

  return (
    <>
      <div className="dialog-top">
        <span className="eyebrow">YOUR FRESH PICKS</span>
        <button
          ref={closeBtn}
          type="button"
          className="close"
          aria-label="닫기"
          onClick={() => close()}
        >
          ×
        </button>
      </div>
      <h2>
        장바구니 <span className="drawer-count">{count}</span>
      </h2>
      {items.length ? (
        <div>
          {items.map((i, n) => (
            <div className="cart-item" key={itemKey(i)}>
              {isDrink(i) ? (
                <DrinkThumb src={DRINKS.find((d) => d.id === drinkKey(i))?.image} />
              ) : (
                <FoodImage id={isCustom(i) ? i.photo : i.id} sizes="64px" />
              )}
              <div>
                <h4>
                  {isDrink(i) ? (
                    itemName(i)
                  ) : isCustom(i) ? (
                    <>
                      {i.name} <span className="custom-badge">MY BOWL</span>
                    </>
                  ) : (
                    <Link
                      href={`/product/${i.id}`}
                      onClick={() => close(false)}
                    >
                      {itemName(i)}
                    </Link>
                  )}
                </h4>
                {(() => {
                  const slot = choiceSlot(i, cat);
                  // 드롭다운에 보이는 선택은 옵션 줄에서 뺀다.
                  const picked = slot?.choices.find(
                    (c) => c.value === slot.value,
                  )?.name;
                  const rest = itemOptions(i)
                    .split(" · ")
                    .filter((x) => x && x !== picked)
                    .join(" · ");
                  return (
                    <>
                      {rest && <p>{rest}</p>}
                      {slot && (
                        <div className="cart-dressing">
                          <label htmlFor={`choice-${n}`}>{slot.label}</label>
                          <select
                            id={`choice-${n}`}
                            value={slot.value}
                            onChange={(e) => {
                              if (changeChoice(n, slot.groupId, e.target.value))
                                toast("같은 구성이 있어 한 줄로 합쳤어요");
                            }}
                          >
                            {slot.choices.map((c) => (
                              <option
                                key={c.value}
                                value={c.value}
                                disabled={!c.available}
                              >
                                {c.name}
                                {c.available ? "" : " (품절)"}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="cart-variant"
                            onClick={() => addOther(n, slot)}
                          >
                            + 다른 {withRo(slot.label)}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
                {!itemAvailable(i) && (
                  <p className="cart-soldout">
                    <b>품절</b> 지금은 주문할 수 없는{" "}
                    {isDrink(i) ? "음료" : "구성"}이에요
                  </p>
                )}
                {!isDrink(i) && (
                  <p className="cart-allergy">
                    알레르기:{" "}
                    {itemAllergens(i).join(", ") || "주요 표기 대상 없음"}
                  </p>
                )}
                <div className="item-bottom">
                  <strong>{money(itemUnitPrice(i) * i.qty)}</strong>
                  <div className="qty">
                    <button
                      type="button"
                      data-delta="-1"
                      aria-label="수량 줄이기"
                      disabled={i.qty === 1}
                      onClick={(e) => changeQty(e, n, -1)}
                    >
                      −
                    </button>
                    <span>{i.qty}</span>
                    <button
                      type="button"
                      data-delta="1"
                      aria-label="수량 늘리기"
                      disabled={i.qty === 99}
                      onClick={(e) => changeQty(e, n, 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="remove"
                    onClick={() => {
                      remove(n);
                      closeBtn.current?.focus({ preventScroll: true });
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
          <section className="cart-drinks" aria-labelledby="cartDrinksTitle">
            <h3 id="cartDrinksTitle">함께 마시기</h3>
            <div className="cart-drink-list">
              {DRINKS.map((d, n) => {
                if (!d.name) return null;
                const inCart =
                  items.find((i) => isDrink(i) && drinkKey(i) === d.id)?.qty ?? 0;
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`cart-drink${inCart ? " is-in" : ""}${d.available ? "" : " is-soldout"}`}
                    disabled={!d.available}
                    aria-label={
                      d.available
                        ? `${d.name} ${money(d.price)} 담기${inCart ? `, 지금 ${inCart}잔` : ""}`
                        : `${d.name} 품절`
                    }
                    onClick={() => addDrink(n)}
                  >
                    <span className="cart-drink-name">{d.name}</span>
                    <span className="cart-drink-price">+{money(d.price)}</span>
                    <span className="cart-drink-add" aria-hidden="true">
                      {!d.available ? "품절" : inCart ? `${inCart}잔 ✓` : "+"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="empty">
          아직 담은 샐러드가 없어요.
          <br />
          신선한 한 그릇을 골라보세요.
          <br />
          <Link className="primary" href="/menu" onClick={() => close(false)}>
            메뉴 보러 가기 <span>↗</span>
          </Link>
        </div>
      )}
      <form onSubmit={submit}>
        <label className="field">
          <span>배달 주소</span>
          <input
            name="address"
            required
            minLength={2}
            maxLength={150}
            placeholder="배달 주소를 입력해주세요"
            autoComplete="street-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <small className="field-hint">
            최소 주문 {money(MIN_DELIVERY_ORDER)} · {money(FREE_DELIVERY_FROM)}{" "}
            이상 무료배달
          </small>
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
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>시간대</span>
            <select
              required
              value={slot?.value ?? ""}
              onChange={(e) => setTime(e.target.value)}
            >
              {options.length ? (
                options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))
              ) : (
                <option value="">
                  오늘은 마감되었어요. 다른 날짜를 선택해주세요.
                </option>
              )}
            </select>
          </label>
        </div>
        <div className="totals">
          <div>
            <span>상품 금액</span>
            <span>{money(subtotal)}</span>
          </div>
          <div>
            <span>배달비</span>
            <span>{fee === 0 && items.length ? "무료" : money(fee)}</span>
          </div>
          {items.length > 0 && fee > 0 && (
            <p className="free-hint">
              {money(FREE_DELIVERY_FROM - subtotal)} 더 담으면 무료배달이에요.
            </p>
          )}
          <div className="total">
            <span>합계</span>
            <span>{money(subtotal + fee)}</span>
          </div>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            required
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          <span>
            메뉴와 선택한 드레싱의 알레르기 정보를 확인했어요. 공용 조리
            공간에서 교차 접촉이 발생할 수 있음을 이해했어요.
          </span>
        </label>
        {deliveryIssue && (
          <p className="order-issue" role="status">
            {deliveryIssue}
          </p>
        )}
        {unavailable && (
          <p className="order-issue" role="status">
            품절되거나 제공이 종료된 메뉴·옵션이 있습니다. 해당 항목을
            제거하거나 다시 선택해주세요.
          </p>
        )}
        <button
          className="primary full"
          type="submit"
          disabled={!items.length || !!deliveryIssue || unavailable}
        >
          결제하러 가기 →
        </button>
      </form>
    </>
  );
}
