"use client";
import ProductCard from "./ProductCard";
import { useCustomerCatalog } from "./CustomerCatalogProvider";

/** 공지 바가 알려주는 신메뉴를 모아 보여준다. 신메뉴가 없으면 아무것도 보여주지 않는다. */
export default function CustomerNewMenu() {
  const { visibleProducts } = useCustomerCatalog();
  const newProducts = visibleProducts.filter((p) => p.isNew);
  if (!newProducts.length) {
    return null;
  }
  return (
    <section className="section wrap" aria-labelledby="newMenuTitle">
      <div className="section-title">
        <div>
          <div className="eyebrow">JUST ARRIVED</div>
          <h2 id="newMenuTitle">신메뉴</h2>
        </div>
      </div>
      <div className="product-grid">
        {newProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
