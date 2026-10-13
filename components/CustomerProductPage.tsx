"use client";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import FoodImage from "@/components/FoodImage";
import PageHeading from "@/components/PageHeading";
import ProductCard from "@/components/ProductCard";
import ProductDetail from "@/components/ProductDetail";
import SoldOutCover from "@/components/SoldOutCover";
import ProductRating from "@/components/ProductRating";
import ProductReviewsPreview from "@/components/ProductReviewsPreview";
import { formatDeliveryHours, type DeliveryHours } from "@/modules/delivery/hours";
import { money } from "@/modules/shared/format";

export default function CustomerProductPage({ id, hours }: { id: number; hours: DeliveryHours }) {
  const { getProduct, visibleProducts: PRODUCTS, NUTRITION, pricingPolicy } = useCustomerCatalog();
  const p = getProduct(id);
  if (!p) {
    return (
      <main className="wrap">
        <p>이 메뉴는 현재 제공되지 않습니다.</p>
        <Link href="/menu">전체 메뉴 보기</Link>
      </main>
    );
  }
  const others = PRODUCTS.filter((o) => o.id !== p.id).slice(0, 4);
  const originCard = !!p.ingredientOrigins?.length && (
    <details className="origin-box" open>
      <summary>원산지·알레르기 정보</summary>
      <table>
        <thead>
          <tr>
            <th>재료</th>
            <th>원산지</th>
            <th>알레르기</th>
          </tr>
        </thead>
        <tbody>
          {p.ingredientOrigins!.map((row, i) => (
            <tr key={i}>
              <td>{row.name}</td>
              <td>{row.origin || "–"}</td>
              <td>{row.allergens || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="origin-note">원재료 수급 상황에 따라 원산지가 바뀔 수 있으며, 바뀌면 바로 반영합니다.</p>
    </details>
  );
  return (
    <main className="wrap pv-wrap">
      <Breadcrumb items={[["홈", "/"], ["메뉴", "/menu"], [p.name]]} />
      <div className="pv">
        <div className="pv-left">
          <div className="pv-photo">
            <FoodImage id={p.id} sizes="(max-width: 700px) 100vw, 590px" preload />
            {p.tag && <span className="product-tag">{p.tag}</span>}
            {p.status === "soldout" && <SoldOutCover />}
          </div>
        </div>
        <div className="pv-info">
          <span className="eyebrow">YOUR DAILY BOWL · {p.en}</span>
          <PageHeading>{p.name}</PageHeading>
          <ProductRating id={p.id} />
          <p className="pv-desc">{p.description}</p>
          <strong className="pv-price">{money(p.price)}</strong>
          <dl className="pv-meta">
            <dt>구성</dt>
            <dd>{p.ingredients}</dd>
            <dt>영양</dt>
            <dd>
              {NUTRITION[p.id]
                ? `${NUTRITION[p.id]!.kcal}kcal · 단백질 ${NUTRITION[p.id]!.protein}g · ${NUTRITION[p.id]!.weight}g`
                : "영양 정보 준비 중"}
              <small>샐러드만 기준(드레싱{p.name.includes("세트") ? "·세트 음료" : ""} 제외)</small>
            </dd>
            <dt>배달</dt>
            <dd>
              예약 배달 {money(pricingPolicy.deliveryFee)} ({money(pricingPolicy.freeDeliveryFrom)} 이상 무료)
              <small>{formatDeliveryHours(hours)}</small>
            </dd>
          </dl>
          <ProductDetail product={p} />
        </div>
      </div>
      {originCard}
      <ProductReviewsPreview id={p.id} />
      <section className="pvsec" aria-labelledby="pvMoreTitle">
        <div className="section-title">
          <div>
            <div className="eyebrow">YOU MAY ALSO LIKE</div>
            <h2 id="pvMoreTitle">다른 메뉴도 둘러보세요</h2>
          </div>
          <Link href="/menu">전체 메뉴 보기 ↗</Link>
        </div>
        <div className="product-grid">
          {others.map((o) => (
            <ProductCard key={o.id} product={o} />
          ))}
        </div>
      </section>
    </main>
  );
}
