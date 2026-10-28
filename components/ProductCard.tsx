"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Link from "next/link";
import { useCart } from "./CartProvider";
import FoodImage from "./FoodImage";
import SoldOutCover from "./SoldOutCover";
import { useReviews } from "./ReviewsProvider";
import { money } from "@/modules/shared/format";
import { type Product } from "@/modules/catalog/customer-product";
import { Plus } from "lucide-react";

export const CARD_SIZES = "(max-width: 600px) 50vw, (max-width: 1240px) 25vw, 300px";

/**
 * 메뉴 카드. 제품명 링크가 카드 전체를 덮어(::after) 어디를 눌러도 상세로 가고,
 * "+" 버튼은 연결된 필수 옵션의 첫 판매 항목을 골라 1개 담고 장바구니를 연다.
 */
export default function ProductCard({ product: p, eager = false }: { product: Product; eager?: boolean }) {
  const { NUTRITION, defaultItem } = useCustomerCatalog();
  const s = useReviews().statsFor(p.id);
  const { add, open } = useCart();

  const initialItem = defaultItem(p.id);
  const soldOut = p.status === "soldout";
  const quickAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!initialItem) {
      return;
    }
    add(initialItem);
    open(e.currentTarget);
  };

  return (
    <div className={`product${soldOut ? " is-soldout" : ""}`}>
      <div className="product-photo">
        <FoodImage id={p.id} sizes={CARD_SIZES} eager={eager} />
        {p.tag && <span className="product-tag">{p.tag}</span>}
        {soldOut ? (
          <SoldOutCover />
        ) : (
          <button
            type="button"
            className="quick-add"
            aria-label={`${p.name} 기본 옵션으로 바로 담기 (1개)`}
            title="기본 옵션으로 바로 담기"
            disabled={!initialItem}
            onClick={quickAdd}
          >
            <Plus size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <h3>
        <Link
          className="product-link"
          href={`/product/${p.id}`}
          aria-label={`${p.name} 상세 보기${soldOut ? " (품절)" : ""}`}
        >
          {p.name}
        </Link>
      </h3>
      <p>{p.ingredients}</p>
      <span className="card-nutri">
        {NUTRITION[p.id] ? `${NUTRITION[p.id]!.kcal}kcal · 단백질 ${NUTRITION[p.id]!.protein}g` : "영양 정보 준비 중"}
      </span>
      <strong>{money(p.price)}</strong>
      {soldOut && <span className="card-soldout">현재 주문할 수 없어요</span>}
      <span className="card-rate">
        <b aria-hidden="true">★</b> {s.avg.toFixed(1)} <small>리뷰 {s.n}</small>
      </span>
    </div>
  );
}
