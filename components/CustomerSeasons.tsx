"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
/** "가, 나" → 두 줄, "가. 나" → 두 줄 (관리자에서 한 줄로 입력한 문구를 기존 디자인처럼 나눠 보여준다) */
function Lines({ text, at }: { text: string; at: string }) {
  const i = text.indexOf(at);
  if (i < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, i + at.length - 1)}
      <br />
      {text.slice(i + at.length)}
    </>
  );
}

export default function CustomerSeasons() {
  const { catalog, visibleProducts } = useCustomerCatalog();
  const [index, setIndex] = useState(0);
  const content = catalog.content;
  const pages = (
    content.seasonPages ?? [
      {
        id: "season",
        title: content.seasonTitle,
        description: content.seasonDescription,
        image: content.seasonImage,
        productId: content.seasonProductId,
        visible: true,
      },
    ]
  ).filter((p) => p.visible);
  if (!content.seasonVisible || !pages.length) {
    return null;
  }
  const page = pages[index % pages.length];
  const adminProduct = catalog.products.find((p) => p.id === page.productId);
  const product = visibleProducts.find((p) => p.id === adminProduct?.customerId);
  const image = page.image || product?.imageUrl;
  const many = pages.length > 1;
  const at = index % pages.length;
  return (
    <section
      className={`monthly wrap${many ? " has-nav" : ""}`}
      aria-roledescription={many ? "carousel" : undefined}
      aria-label="이달의 이벤트"
    >
      <div className="monthly-copy">
        <span className="pill">THIS MONTH’S EVENT</span>
        <h2>
          <Lines text={page.title} at=", " />
        </h2>
        {page.description && (
          <p>
            <Lines text={page.description} at=". " />
          </p>
        )}
        {product && (
          <Link className="text-link" href={`/product/${product.id}`}>
            {product.name} 만나보기 ↗
          </Link>
        )}
      </div>
      <div className="monthly-food">
        {image && (
          <Image
            key={image}
            className="food-image"
            src={image}
            alt={product?.name ?? page.title}
            width={1024}
            height={1024}
            sizes="(max-width:600px) 280px,40vw"
          />
        )}
      </div>
      <div className="monthly-caption">
        <span>NEW COMBINATION</span>
        <strong>{product?.name || page.title}</strong>
        {page.description && <span>{page.description}</span>}
      </div>
      {/* 여러 장이면 가운데 사진 바로 밑에 화살표를 둔다 */}
      {many && (
        <div className="season-nav">
          <button type="button" aria-label="이전 시즌 메뉴" disabled={at === 0} onClick={() => setIndex(at - 1)}>
            ←
          </button>
          <span role="status" aria-live="polite">
            {at + 1} / {pages.length}
          </span>
          <button
            type="button"
            aria-label="다음 시즌 메뉴"
            disabled={at === pages.length - 1}
            onClick={() => setIndex(at + 1)}
          >
            →
          </button>
        </div>
      )}
    </section>
  );
}
