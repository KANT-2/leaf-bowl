"use client";

import Image from "next/image";
import { useCart } from "./CartProvider";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import PageHeading from "./PageHeading";
import SoldOutCover from "./SoldOutCover";
import { money } from "@/modules/shared/format";

/** 음료만 따로 고르는 페이지. + 를 누르면 장바구니에 음료 한 줄로 담기고 장바구니가 열린다. */
export default function DrinksView() {
  const { DRINKS, DRINK_KCAL } = useCustomerCatalog();
  const { addDrink, open } = useCart();
  // 숨김·삭제된 음료는 공개 데이터에서 이름이 비워져 온다.
  const list = DRINKS.map((d, n) => ({ ...d, n })).filter((d) => d.name);

  return (
    <section className="menu-page drinks-page" aria-label="음료">
      <div className="section-title">
        <div>
          <div className="eyebrow">DRINKS</div>
          <PageHeading>음료</PageHeading>
        </div>
      </div>
      <div className="product-grid">
        {list.map((d) => (
          <div
            key={d.id}
            className={`product drink-card${d.available ? "" : " is-soldout"}`}
          >
            <div className="product-photo">
              {d.image && (
                <Image
                  className="food-image"
                  src={d.image}
                  alt={d.name}
                  width={1024}
                  height={1024}
                  sizes="(max-width: 600px) 50vw, 300px"
                  loading="eager"
                />
              )}
              {!d.available && <SoldOutCover />}
              {!d.available ? (
                <span className="soldout-chip">품절</span>
              ) : (
                <button
                  type="button"
                  className="quick-add"
                  aria-label={`${d.name} ${money(d.price)} 장바구니에 담기`}
                  title="장바구니에 담기"
                  disabled={!d.available}
                  onClick={(e) => {
                    addDrink(d.n);
                    open(e.currentTarget);
                  }}
                >
                  +
                </button>
              )}
            </div>
            <h3>{d.name}</h3>
            {(DRINK_KCAL[d.n] ?? 0) > 0 && (
              <span className="card-nutri">약 {DRINK_KCAL[d.n]}kcal</span>
            )}
            <strong>{money(d.price)}</strong>
            {!d.available && (
              <span className="card-soldout">현재 주문할 수 없어요</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
