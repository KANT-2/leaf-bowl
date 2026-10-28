"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Breadcrumb from "./Breadcrumb";
import PageHeading from "./PageHeading";
import ProductCard from "./ProductCard";
import SoldOutCover from "./SoldOutCover";
import { useCart } from "./CartProvider";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { money } from "@/modules/shared/format";

export default function CustomerDrinkPage({ id }: { id: string }) {
  const { DRINKS, DRINK_KCAL, visibleProducts: PRODUCTS } = useCustomerCatalog();
  const { addDrink, open } = useCart();
  const [qty, setQty] = useState(1);
  const index = DRINKS.findIndex((d) => d.id === id && d.name);
  const d = index >= 0 ? DRINKS[index] : undefined;
  if (!d) {
    return (
      <main className="wrap">
        <p>이 음료는 현재 제공되지 않습니다.</p>
        <Link href="/drinks">전체 음료 보기</Link>
      </main>
    );
  }
  const kcal = DRINK_KCAL[index];
  const recommended = PRODUCTS.slice(0, 4);
  return (
    <main className="wrap pv-wrap">
      <Breadcrumb items={[["홈", "/"], ["음료", "/drinks"], [d.name]]} />
      <div className="pv">
        <div className="pv-photo">
          {d.image && (
            <Image
              className="food-image"
              src={d.image}
              alt={d.name}
              width={1024}
              height={1024}
              sizes="(max-width: 700px) 100vw, 590px"
              priority
            />
          )}
          {!d.available && <SoldOutCover />}
        </div>
        <div className="pv-info">
          <span className="eyebrow">DRINKS</span>
          <PageHeading>{d.name}</PageHeading>
          {d.description && <p className="pv-desc">{d.description}</p>}
          <strong className="pv-price">{money(d.price)}</strong>
          <dl className="pv-meta">
            <dt>구성</dt>
            <dd>{d.ingredients || "준비 중"}</dd>
            <dt>원산지</dt>
            <dd>{d.origin || "표기 대상 없음"}</dd>
            {kcal !== undefined && (
              <>
                <dt>영양</dt>
                <dd>약 {kcal}kcal</dd>
              </>
            )}
          </dl>
          <div className="allergen-box">주요 알레르기 재료: {d.allergens.join(", ") || "표기 대상 없음"}</div>
          {!d.available && (
            <p className="pv-soldout" role="status">
              <strong>품절</strong> 지금은 주문할 수 없어요. 잠시 준비 중이에요.
            </p>
          )}
          <div className="dialog-bottom pv-buy">
            <div className="qty" role="group" aria-label="음료 수량">
              <button
                type="button"
                disabled={!d.available || qty === 1}
                aria-label="수량 줄이기"
                onClick={() => setQty((current) => current - 1)}
              >
                −
              </button>
              <span aria-live="polite">{qty}</span>
              <button
                type="button"
                disabled={!d.available || qty === 99}
                aria-label="수량 늘리기"
                onClick={() => setQty((current) => current + 1)}
              >
                +
              </button>
            </div>
            <button
              className="primary"
              type="button"
              disabled={!d.available}
              onClick={(e) => {
                addDrink(index, qty);
                open(e.currentTarget);
              }}
            >
              {d.available ? `${money(d.price * qty)} · ${qty}잔 담기` : "품절 · 주문할 수 없어요"}
            </button>
          </div>
        </div>
      </div>
      {!!recommended.length && (
        <section className="pvsec" aria-labelledby="drinkMoreTitle">
          <div className="section-title">
            <div>
              <div className="eyebrow">YOU MAY ALSO LIKE</div>
              <h2 id="drinkMoreTitle">이 음료와 어울리는 샐러드</h2>
            </div>
            <Link href="/menu">전체 메뉴 보기 ↗</Link>
          </div>
          <div className="product-grid">
            {recommended.map((o) => (
              <ProductCard key={o.id} product={o} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
