"use client";
import { hasCustomIngredientIds, isCustom, isDrink, itemKey, withChoice } from "@/modules/cart/identity";
import { drinkKey } from "@/modules/cart/identifiers";
import { money } from "@/modules/shared/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "../CartProvider";
import { useCustomerCatalog } from "../CustomerCatalogProvider";
import { useToast } from "../ToastProvider";

import { type ChoiceSlot } from "@/features/cart/choice";
import CartLine from "./CartLine";
interface BodyProps {
  closeBtn: React.RefObject<HTMLButtonElement | null>;
}

export default function CartBody({ closeBtn }: BodyProps) {
  const cat = useCustomerCatalog();
  const { deliveryFee } = cat;
  const MIN_DELIVERY_ORDER = cat.pricingPolicy.minDeliveryOrder;
  const FREE_DELIVERY_FROM = cat.pricingPolicy.freeDeliveryFrom;
  const router = useRouter();
  const { itemUnitPrice, itemAvailable, DRINKS } = cat;
  const { items, count, close, addDrink, addVariant } = useCart();
  const needsIngredients = items.some((i) => isCustom(i) && !hasCustomIngredientIds(i));
  const toast = useToast();
  // "다른 드레싱으로"를 누른 뒤 새 줄의 선택 칸으로 포커스를 옮기기 위한 위치
  const focusLine = useRef<number | null>(null);

  /** 같은 샐러드를 아직 담지 않은 다른 선택지(품절 제외)로 1개 더 담는다. */
  const addOther = (index: number, slot: ChoiceSlot) => {
    const cur = items[index];
    const taken = new Set(items.map(itemKey));
    const pick = slot.choices.find((c) => c.available && !taken.has(itemKey(withChoice(cur, slot.groupId, c.value))));
    if (!pick) {
      toast(`${slot.label}: 고를 수 있는 항목을 모두 담았어요. 수량을 늘려주세요.`);
      return;
    }
    focusLine.current = addVariant(index, slot.groupId, pick.value);
  };

  useEffect(() => {
    const at = focusLine.current;
    if (at === null) {
      return;
    }
    focusLine.current = null;
    document.getElementById(`choice-${at}`)?.focus();
  }, [items]);
  const [ack, setAck] = useState(false);

  const unavailable = items.some((i) => !itemAvailable(i));
  const subtotal = items.reduce((n, i) => n + itemUnitPrice(i) * i.qty, 0);
  const fee = items.length ? deliveryFee(subtotal) : 0;
  // 배달 주문이 안 되는 이유 (없으면 빈 문자열)
  const deliveryIssue = !items.length
    ? ""
    : subtotal < MIN_DELIVERY_ORDER
      ? `배달은 ${money(MIN_DELIVERY_ORDER)} 이상부터 가능해요. ${money(MIN_DELIVERY_ORDER - subtotal)} 더 담아주세요.`
      : "";

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (unavailable) {
      toast(
        needsIngredients ? "저장한 조합의 재료를 다시 선택해주세요." : "품절되거나 삭제된 메뉴·옵션을 제거해주세요.",
      );
      return;
    }
    if (!items.length || deliveryIssue) {
      return;
    }
    router.push("/checkout");
    close(false);
  };

  return (
    <>
      <div className="dialog-top">
        <span className="eyebrow">YOUR FRESH PICKS</span>
        <button ref={closeBtn} type="button" className="close" aria-label="닫기" onClick={() => close()}>
          ×
        </button>
      </div>
      <h2>
        장바구니 <span className="drawer-count">{count}</span>
      </h2>
      {items.length ? (
        <div>
          {items.map((i, n) => (
            <CartLine key={itemKey(i)} item={i} index={n} cat={cat} closeBtn={closeBtn} onOther={addOther} />
          ))}
          <section className="cart-drinks" aria-labelledby="cartDrinksTitle">
            <h3 id="cartDrinksTitle">함께 마시기</h3>
            <div className="cart-drink-list">
              {DRINKS.map((d, n) => {
                if (!d.name) {
                  return null;
                }
                const inCart = items.find((i) => isDrink(i) && drinkKey(i) === d.id)?.qty ?? 0;
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
        <small className="field-hint">
          최소 주문 {money(MIN_DELIVERY_ORDER)} · {money(FREE_DELIVERY_FROM)} 이상 무료배달
        </small>
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
            <p className="free-hint">{money(FREE_DELIVERY_FROM - subtotal)} 더 담으면 무료배달이에요.</p>
          )}
          <div className="total">
            <span>합계</span>
            <span>{money(subtotal + fee)}</span>
          </div>
        </div>
        <label className="check-label">
          <input type="checkbox" required checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            메뉴와 선택한 드레싱의 알레르기 정보를 확인했어요. 공용 조리 공간에서 교차 접촉이 발생할 수 있음을
            이해했어요.
          </span>
        </label>
        {deliveryIssue && (
          <p className="order-issue" role="status">
            {deliveryIssue}
          </p>
        )}
        {unavailable && (
          <p className="order-issue" role="status">
            {needsIngredients
              ? "저장한 조합의 재료를 다시 선택해주세요."
              : "품절되거나 제공이 종료된 메뉴·옵션이 있습니다. 해당 항목을 제거하거나 다시 선택해주세요."}
          </p>
        )}
        <button className="primary full" type="submit" disabled={!items.length || !!deliveryIssue || unavailable}>
          결제하러 가기 →
        </button>
      </form>
    </>
  );
}
