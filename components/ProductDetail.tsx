"use client";
import Image from "next/image";
import { useState } from "react";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { useCart } from "./CartProvider";
import { useToast } from "./ToastProvider";
import { money } from "@/modules/shared/format";
import { type Product } from "@/modules/catalog/customer-product";

export default function ProductDetail({ product: p }: { product: Product }) {
  const { catalog, groupsFor, DRESSINGS, DRINKS, kcalOf } = useCustomerCatalog();
  const { add, open } = useCart();
  const toast = useToast();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const groups = groupsFor(p.id).map((g) => ({
    ...g,
    choices:
      g.source === "custom"
        ? g.choices.map((c) => ({ ...c, soldout: false }))
        : // 품절 항목도 '품절' 표시와 함께 보여주되 고를 수는 없게 한다 (숨김·삭제는 제외).
          catalog.products
            .filter(
              (c) => c.type === (g.source === "drinks" ? "drink" : "dressing") && !c.deleted && c.status !== "hidden",
            )
            .map((c) => ({
              id: c.id,
              name: c.name,
              price: c.price,
              image: c.image,
              soldout: c.status !== "active",
            })),
  }));
  const chosen = groups.flatMap((g) => g.choices.filter((c) => (selected[g.id] ?? []).includes(c.id)));
  const complete = groups.every((g) => !g.required || g.choices.some((c) => (selected[g.id] ?? []).includes(c.id)));
  const optionPrice = chosen.reduce((n, c) => n + c.price, 0);
  const dress = chosen.find((c) => catalog.products.find((x) => x.id === c.id)?.type === "dressing");
  const drinkChoices = chosen.filter((c) => catalog.products.find((x) => x.id === c.id)?.type === "drink");
  const dressing = dress ? DRESSINGS.findIndex((d) => d.id === dress.id) : -1;
  const drinks = drinkChoices.map((c) => DRINKS.findIndex((d) => d.id === c.id));
  const accounted = (dressing >= 0 ? DRESSINGS[dressing].price : 0) + drinks.reduce((n, i) => n + DRINKS[i].price, 0);
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (p.status !== "active") {
            return;
          }
          if (!complete) {
            const missing = groups.find(
              (g) => g.required && !g.choices.some((c) => (selected[g.id] ?? []).includes(c.id)),
            );
            toast(missing ? `${missing.name} 옵션을 선택해주세요.` : "필수 옵션을 선택해주세요.");
            return;
          }
          add({
            id: p.id,
            dressing,
            drinks,
            qty,
            optionSelections: selected,
            extraPrice: optionPrice - accounted,
            extraOptions: chosen.filter((c) => c !== dress && !drinkChoices.includes(c)).map((c) => c.name),
          });
          open(e.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]'));
        }}
      >
        {groups.map((g) => (
          <fieldset key={g.id} className="option-list">
            <legend>
              {g.name}
              {g.required ? " (필수)" : ""}
            </legend>
            {g.choices.length ? (
              g.choices.map((c) => (
                <label key={c.id} className={c.soldout ? "is-soldout" : undefined}>
                  <input
                    type={g.multiple ? "checkbox" : "radio"}
                    name={g.id}
                    disabled={c.soldout}
                    checked={(selected[g.id] ?? []).includes(c.id)}
                    onChange={(e) =>
                      setSelected((current) => ({
                        ...current,
                        [g.id]: g.multiple
                          ? e.target.checked
                            ? [...(current[g.id] ?? []), c.id]
                            : (current[g.id] ?? []).filter((id) => id !== c.id)
                          : e.target.checked
                            ? [c.id]
                            : [],
                      }))
                    }
                  />
                  {c.name}
                  {c.soldout && <span className="opt-soldout">품절</span>}
                  {c.price > 0 && <span> +{money(c.price)}</span>}
                  {"image" in c && typeof c.image === "string" && c.image && (
                    <span className="opt-preview" aria-hidden="true">
                      <Image src={c.image} alt="" width={1024} height={1024} sizes="150px" />
                    </span>
                  )}
                </label>
              ))
            ) : (
              <p>현재 선택 가능한 옵션이 없습니다.</p>
            )}
            {!g.required && !g.multiple && (
              <button type="button" onClick={() => setSelected((s) => ({ ...s, [g.id]: [] }))}>
                선택 안 함
              </button>
            )}
          </fieldset>
        ))}
        {kcalOf(p.id, dressing, drinks) !== undefined && (
          <p className="pv-kcal" aria-live="polite">
            선택한 구성 약{" "}
            <b>
              {kcalOf(p.id, dressing, drinks)}
              kcal
            </b>
            <span>영양 예시 값 · 추가 토핑 영양은 포함되지 않습니다.</span>
          </p>
        )}
        <div className="allergen-box">
          주요 알레르기 재료:{" "}
          {[...new Set([...p.allergens, ...(DRESSINGS[dressing]?.allergens ?? [])])].join(", ") || "표기 대상 없음"}
        </div>
        {p.status === "soldout" && (
          <p className="pv-soldout" role="status">
            <strong>품절</strong> 지금은 주문할 수 없어요. 잠시 준비 중이에요.
          </p>
        )}
        <div className="dialog-bottom pv-buy">
          <div className="qty">
            <button type="button" disabled={qty === 1} aria-label="수량 줄이기" onClick={() => setQty(qty - 1)}>
              −
            </button>
            <span>{qty}</span>
            <button type="button" disabled={qty === 99} aria-label="수량 늘리기" onClick={() => setQty(qty + 1)}>
              +
            </button>
          </div>
          <button className="primary" type="submit" disabled={p.status !== "active"}>
            {p.status === "soldout" ? "품절 · 주문할 수 없어요" : money((p.price + optionPrice) * qty) + " · 담기"}
          </button>
        </div>
      </form>
    </>
  );
}
