"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import PageHeading from "./PageHeading";
import ProductCard from "./ProductCard";
import { useReviews } from "./ReviewsProvider";
import { MATCH_URL } from "@/features/customer/routes";
import { type Product } from "@/modules/catalog/customer-product";

type Filter = string;

type SortKey =
  | "default"
  | "priceLow"
  | "priceHigh"
  | "kcalLow"
  | "proteinHigh"
  | "rating";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "default", label: "추천순" },
  { key: "priceLow", label: "가격 낮은순" },
  { key: "priceHigh", label: "가격 높은순" },
  { key: "kcalLow", label: "칼로리 낮은순" },
  { key: "proteinHigh", label: "단백질 높은순" },
  { key: "rating", label: "별점 높은순" },
];

// 메뉴에 실제로 있는 알레르기만 (보여주는 순서 고정)

export default function MenuSection() {
  const { NUTRITION } = useCustomerCatalog();
  const { catalog, visibleProducts, catalogConfig } = useCustomerCatalog();
  const FILTERS = [
    { key: "all", label: "전체 메뉴" },
    ...(catalog.categories ?? []).map((label) => ({ key: label, label })),
  ];
  const ALLERGENS = [
    ...new Set([
      ...catalogConfig.allergenOrder,
      ...visibleProducts.flatMap((p) => p.allergens),
    ]),
  ].filter((a) => visibleProducts.some((p) => p.allergens.includes(a)));
  const { statsFor } = useReviews();
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [showAllergy, setShowAllergy] = useState(false);
  // 다른 페이지로 갔다 돌아와도(Activity로 숨겨졌다 다시 보여도) 알레르기 제외 선택은
  // 유지하지 않고 매번 새로 고르게 한다.
  useLayoutEffect(() => {
    return () => setExcluded([]);
  }, []);

  const q = term.trim().toLowerCase();
  const found = visibleProducts.filter(
    (p) =>
      (filter === "all" || p.categoryLabel === filter) &&
      `${p.name} ${p.en} ${p.ingredients}`.toLowerCase().includes(q) &&
      !p.allergens.some((a) => excluded.includes(a)),
  );
  const compare: Record<SortKey, (a: Product, b: Product) => number> = {
    default: (a, b) => a.id - b.id,
    priceLow: (a, b) => a.price - b.price || a.id - b.id,
    priceHigh: (a, b) => b.price - a.price || a.id - b.id,
    kcalLow: (a, b) =>
      (NUTRITION[a.id]?.kcal ?? Infinity) -
        (NUTRITION[b.id]?.kcal ?? Infinity) || a.id - b.id,
    proteinHigh: (a, b) =>
      (NUTRITION[b.id]?.protein ?? -Infinity) -
        (NUTRITION[a.id]?.protein ?? -Infinity) || a.id - b.id,
    rating: (a, b) => statsFor(b.id).avg - statsFor(a.id).avg || a.id - b.id,
  };
  const shown = [...found].sort(compare[sort]);

  const toggleAllergen = (a: string) =>
    setExcluded((list) =>
      list.includes(a) ? list.filter((x) => x !== a) : [...list, a],
    );
  const resetAll = () => {
    setFilter("all");
    setTerm("");
    setExcluded([]);
  };

  return (
    <section className="menu-page" id="menu">
      <div className="section-title">
        <div>
          <div className="eyebrow">FIND YOUR DAILY BOWL</div>
          <PageHeading>매일 먹고 싶은 메뉴</PageHeading>
        </div>
        <label className="search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="6" />
            <path d="m15 15 5 5" />
          </svg>
          <input
            type="search"
            placeholder="메뉴 검색"
            aria-label="메뉴 검색"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
      </div>
      <div className="filters" role="group" aria-label="메뉴 분류">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "active" : ""}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {false && <span>NEW</span>}
          </button>
        ))}
      </div>
      <div className="menu-tools">
        <button
          type="button"
          className={`allergy-toggle${excluded.length ? " active" : ""}`}
          aria-expanded={showAllergy}
          aria-controls="allergyFilter"
          onClick={() => setShowAllergy((v) => !v)}
        >
          알레르기 제외{excluded.length ? ` ${excluded.length}` : ""}{" "}
          <span aria-hidden="true">{showAllergy ? "▴" : "▾"}</span>
        </button>
        <span className="menu-count" aria-live="polite">
          {shown.length}개 메뉴
        </span>
        <label className="menu-sort">
          <span className="sr-only">정렬</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="allergy-filter"
        id="allergyFilter"
        role="group"
        aria-label="제외할 알레르기 재료"
        hidden={!showAllergy}
      >
        <p>
          선택한 재료가 들어간 메뉴를 숨겨요. 드레싱 알레르기는 상세에서 따로
          확인해주세요.
        </p>
        <div className="allergy-chips">
          {ALLERGENS.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={excluded.includes(a)}
              onClick={() => toggleAllergen(a)}
            >
              {excluded.includes(a) ? "✕ " : ""}
              {a}
            </button>
          ))}
          {excluded.length > 0 && (
            <button
              type="button"
              className="allergy-clear"
              onClick={() => setExcluded([])}
            >
              초기화
            </button>
          )}
        </div>
      </div>
      <div className="product-grid">
        {shown.length ? (
          shown.map((p, i) => (
            <ProductCard key={p.id} product={p} eager={i < 4} />
          ))
        ) : (
          <div className="empty" style={{ gridColumn: "1/-1" }}>
            조건에 맞는 메뉴가 없어요. 검색어나 필터를 줄여보세요.
            <br />
            <button
              type="button"
              className="ghost-btn empty-reset"
              onClick={resetAll}
            >
              조건 모두 지우기
            </button>
            <Link className="empty-match" href={MATCH_URL}>
              원하는 재료로 직접 만들기 ♡
            </Link>
          </div>
        )}
      </div>
      <aside className="menu-match" aria-label="내 취향 찾기 안내">
        <div>
          <strong>원하는 조합이 없다면?</strong>
          <p>좋아하는 재료에 하트를 보내고 나만의 샐러드를 만들어보세요.</p>
        </div>
        <Link className="primary" href={MATCH_URL}>
          내 취향 찾기 <span>♡</span>
        </Link>
      </aside>
      <p className="ingredient-note">
        모든 메뉴는 드레싱을 선택할 수 있어요. 음료는 메뉴 선택 후 추가할 수
        있습니다.
      </p>
    </section>
  );
}
