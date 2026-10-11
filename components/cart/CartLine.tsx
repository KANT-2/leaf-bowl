"use client";
import { isCustom, isDrink } from "@/lib/cart";
import { drinkKey } from "@/lib/cart-identifiers";
import {
  choiceSlot,
  withRo,
  type ChoiceSlot,
} from "@/lib/customer/cart-choice";
import type { CustomerCatalog } from "@/lib/customer/catalog";
import { money } from "@/lib/products";
import type { CartItem } from "@/lib/storage";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "../CartProvider";
import FoodImage from "../FoodImage";
import { useToast } from "../ToastProvider";

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

export default function CartLine({
  item,
  index,
  cat,
  closeBtn,
  onOther,
}: {
  item: CartItem;
  index: number;
  cat: CustomerCatalog;
  closeBtn: React.RefObject<HTMLButtonElement | null>;
  onOther: (index: number, slot: ChoiceSlot) => void;
}) {
  const { update, remove, close, changeChoice } = useCart();
  const toast = useToast();
  const {
    itemAllergens,
    itemName,
    itemOptions,
    itemUnitPrice,
    itemAvailable,
    DRINKS,
  } = cat;

  const slot = choiceSlot(item, cat);
  // 드롭다운에 보이는 선택은 옵션 줄에서 뺀다.
  const picked = slot?.choices.find((c) => c.value === slot.value)?.name;
  const rest = itemOptions(item)
    .split(" · ")
    .filter((x) => x && x !== picked)
    .join(" · ");
  const changeQty = (
    e: React.MouseEvent<HTMLButtonElement>,
    index: number,
    delta: number,
  ) => {
    const next = item.qty + delta;
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

  return (
    <div className="cart-item">
      {isDrink(item) ? (
        <DrinkThumb src={DRINKS.find((d) => d.id === drinkKey(item))?.image} />
      ) : (
        <FoodImage id={isCustom(item) ? item.photo : item.id} sizes="64px" />
      )}
      <div>
        <h4>
          {isDrink(item) ? (
            itemName(item)
          ) : isCustom(item) ? (
            <>
              {item.name} <span className="custom-badge">MY BOWL</span>
            </>
          ) : (
            <Link href={`/product/${item.id}`} onClick={() => close(false)}>
              {itemName(item)}
            </Link>
          )}
        </h4>

        <>
          {rest && <p>{rest}</p>}
          {slot && (
            <div className="cart-dressing">
              <label htmlFor={`choice-${index}`}>{slot.label}</label>
              <select
                id={`choice-${index}`}
                value={slot.value}
                onChange={(e) => {
                  if (changeChoice(index, slot.groupId, e.target.value))
                    toast("같은 구성이 있어 한 줄로 합쳤어요");
                }}
              >
                {slot.choices.map((c) => (
                  <option key={c.value} value={c.value} disabled={!c.available}>
                    {c.name}
                    {c.available ? "" : " (품절)"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="cart-variant"
                onClick={() => onOther(index, slot)}
              >
                + 다른 {withRo(slot.label)}
              </button>
            </div>
          )}
        </>

        {!itemAvailable(item) && (
          <p className="cart-soldout">
            <b>품절</b> 지금은 주문할 수 없는 {isDrink(item) ? "음료" : "구성"}
            이에요
          </p>
        )}
        {!isDrink(item) && (
          <p className="cart-allergy">
            알레르기: {itemAllergens(item).join(", ") || "주요 표기 대상 없음"}
          </p>
        )}
        <div className="item-bottom">
          <strong>{money(itemUnitPrice(item) * item.qty)}</strong>
          <div className="qty">
            <button
              type="button"
              data-delta="-1"
              aria-label="수량 줄이기"
              disabled={item.qty === 1}
              onClick={(e) => changeQty(e, index, -1)}
            >
              −
            </button>
            <span>{item.qty}</span>
            <button
              type="button"
              data-delta="1"
              aria-label="수량 늘리기"
              disabled={item.qty === 99}
              onClick={(e) => changeQty(e, index, 1)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="remove"
            onClick={() => {
              remove(index);
              closeBtn.current?.focus({ preventScroll: true });
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
