"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import PageHeading from "./PageHeading";
import ProductCard from "./ProductCard";
import { useReviews } from "./ReviewsProvider";
import { MATCH_URL } from "@/features/customer/routes";
import { type Product, type ProductTag } from "@/modules/catalog/customer-product";
import { searchMenus, type MenuPage, type MenuSearch } from "@/features/catalog/client";

type Filter = string;

type SortKey = "default" | "priceLow" | "priceHigh" | "kcalLow" | "proteinHigh" | "rating";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "default", label: "추천순" },
  { key: "priceLow", label: "가격 낮은순" },
  { key: "priceHigh", label: "가격 높은순" },
  { key: "kcalLow", label: "칼로리 낮은순" },
  { key: "proteinHigh", label: "단백질 높은순" },
  { key: "rating", label: "별점 높은순" },
];

const PAGE_SIZE = 8;

// 영양·별점 정렬은 일치하는 전체 메뉴를 받은 다음 화면에서 정렬한다.
function useMenuResults(query: MenuSearch, complete: boolean, revision: number, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify({ query, complete, revision, attempt });
  const [result, setResult] = useState<{
    key: string;
    data?: MenuPage;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const request = JSON.parse(requestKey) as { query: MenuSearch; complete: boolean };
        let data = await searchMenus(request.query, controller.signal);
        if (request.complete) {
          const allItems = [...data.items];
          const keys = new Set(allItems.map((item) => item.key));
          for (let page = 2; allItems.length < data.total; page += 1) {
            const next = await searchMenus({ ...request.query, page }, controller.signal);
            if (next.total !== data.total || next.items.length === 0 || next.items.some((item) => keys.has(item.key))) {
              throw new Error("메뉴가 변경되었습니다. 다시 조회해주세요.");
            }
            for (const item of next.items) {
              keys.add(item.key);
              allItems.push(item);
            }
          }
          data = { ...data, items: allItems };
        }
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, error: error instanceof Error ? error.message : "메뉴를 불러오지 못했습니다." });
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, enabled]);

  const current = result?.key === requestKey ? result : null;
  return {
    data: enabled ? current?.data : undefined,
    loading: enabled && current === null,
    error: enabled ? current?.error : undefined,
    retry: () => setAttempt((value) => value + 1),
  };
}

function productTag(value: string): ProductTag | undefined {
  return value === "BEST" || value === "PLANT" || value === "PICK" || value === "NEW" ? value : undefined;
}

function validPrice(value: string) {
  return value === "" || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)));
}

export default function MenuSection() {
  const { NUTRITION, catalog, visibleProducts, catalogConfig, revision } = useCustomerCatalog();
  const FILTERS = [
    { key: "all", label: "전체 메뉴" },
    ...(catalog.categories ?? []).map((label) => ({ key: label, label })),
  ];
  const ALLERGENS = [
    ...new Set([...catalogConfig.allergenOrder, ...visibleProducts.flatMap((p) => p.allergens)]),
  ].filter((a) => visibleProducts.some((p) => p.allergens.includes(a)));
  const { statsFor } = useReviews();
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [showAllergy, setShowAllergy] = useState(false);
  const [page, setPage] = useState(1);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  // 다른 페이지로 갔다 돌아와도(Activity로 숨겨졌다 다시 보여도) 알레르기 제외 선택은
  // 유지하지 않고 매번 새로 고르게 한다.
  useLayoutEffect(() => {
    return () => {
      setExcluded([]);
      setPage(1);
    };
  }, []);

  const localSort = sort === "kcalLow" || sort === "proteinHigh" || sort === "rating";
  const serverSort: MenuSearch["sort"] = sort === "priceLow" || sort === "priceHigh" ? sort : "default";
  const priceError =
    !validPrice(minPrice) || !validPrice(maxPrice)
      ? "가격은 0 이상의 정수로 입력해주세요."
      : minPrice !== "" && maxPrice !== "" && Number(minPrice) > Number(maxPrice)
        ? "최소 가격은 최대 가격보다 클 수 없습니다."
        : "";
  const { data, loading, error, retry } = useMenuResults(
    {
      q: term,
      category: filter === "all" ? undefined : filter,
      min_price: minPrice === "" ? undefined : Number(minPrice),
      max_price: maxPrice === "" ? undefined : Number(maxPrice),
      exclude_allergens: excluded,
      sort: serverSort,
      page: localSort ? 1 : page,
      size: localSort ? 50 : PAGE_SIZE,
    },
    localSort,
    revision,
    !priceError,
  );

  // 상세·장바구니용 기존 메타데이터에 API가 반환한 최신 표시값을 합친다.
  const byId = new Map(visibleProducts.map((product) => [product.id, product]));
  const found: Product[] = (data?.items ?? []).flatMap((item) => {
    const original = byId.get(item.id);
    return original
      ? [
          {
            ...original,
            id: item.id,
            name: item.name,
            en: item.name_en ?? "",
            price: item.price,
            categoryLabel: item.category,
            status: item.status,
            isOnSale: item.status === "active",
            imageUrl: item.image_url,
            allergens: item.allergens,
            tag: productTag(item.badge),
          },
        ]
      : [];
  });
  const missingMetadata = data !== undefined && found.length !== data.items.length;
  const errorMessage =
    priceError || error || (missingMetadata ? "상품 정보가 변경되었습니다. 화면을 새로고침해주세요." : "");
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const compare: Record<SortKey, (a: Product, b: Product) => number> = {
    default: (a, b) => a.id - b.id,
    priceLow: (a, b) => a.price - b.price || a.id - b.id,
    priceHigh: (a, b) => b.price - a.price || a.id - b.id,
    kcalLow: (a, b) => (NUTRITION[a.id]?.kcal ?? Infinity) - (NUTRITION[b.id]?.kcal ?? Infinity) || a.id - b.id,
    proteinHigh: (a, b) =>
      (NUTRITION[b.id]?.protein ?? -Infinity) - (NUTRITION[a.id]?.protein ?? -Infinity) || a.id - b.id,
    rating: (a, b) => statsFor(b.id).avg - statsFor(a.id).avg || a.id - b.id,
  };
  const shown = localSort ? [...found].sort(compare[sort]).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : found;

  const toggleAllergen = (a: string) => {
    setExcluded((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]));
    setPage(1);
  };

  const resetAll = () => {
    setFilter("all");
    setTerm("");
    setExcluded([]);
    setMinPrice("");
    setMaxPrice("");
    setPage(1);
  };

  return (
    <section className="menu-page" id="menu">
      <div className="section-title">
        <div>
          <div className="eyebrow">FIND YOUR DAILY BOWL</div>
          <PageHeading>매일 먹고 싶은 메뉴</PageHeading>
        </div>
        <label className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="10" cy="10" r="6" />
            <path d="m15 15 5 5" />
          </svg>
          <input
            type="search"
            placeholder="메뉴 검색"
            aria-label="메뉴 검색"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(1);
            }}
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
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
          >
            {f.label}
            {false && <span>NEW</span>}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", marginBottom: 16 }}>
        <label>
          최소 가격 (원)
          <input
            type="number"
            min="0"
            step="1"
            value={minPrice}
            placeholder="제한 없음"
            style={{ display: "block", width: 140 }}
            onChange={(event) => {
              setMinPrice(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          최대 가격 (원)
          <input
            type="number"
            min="0"
            step="1"
            value={maxPrice}
            placeholder="제한 없음"
            style={{ display: "block", width: 140 }}
            onChange={(event) => {
              setMaxPrice(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <button type="button" className="ghost-btn" onClick={resetAll}>
          조건 모두 지우기
        </button>
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
          {loading ? "메뉴 불러오는 중…" : errorMessage ? "메뉴 조회 실패" : `전체 ${total}개 메뉴`}
        </span>
        <label className="menu-sort">
          <span className="sr-only">정렬</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setPage(1);
            }}
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
        <p>선택한 재료가 들어간 메뉴를 숨겨요. 드레싱 알레르기는 상세에서 따로 확인해주세요.</p>
        <div className="allergy-chips">
          {ALLERGENS.map((a) => (
            <button key={a} type="button" aria-pressed={excluded.includes(a)} onClick={() => toggleAllergen(a)}>
              {excluded.includes(a) ? "✕ " : ""}
              {a}
            </button>
          ))}
          {excluded.length > 0 && (
            <button
              type="button"
              className="allergy-clear"
              onClick={() => {
                setExcluded([]);
                setPage(1);
              }}
            >
              초기화
            </button>
          )}
        </div>
      </div>
      <div className="product-grid" aria-busy={loading}>
        {loading ? (
          <p role="status" style={{ gridColumn: "1/-1" }}>
            메뉴를 불러오고 있습니다.
          </p>
        ) : errorMessage ? (
          <div role="alert" className="empty" style={{ gridColumn: "1/-1" }}>
            <p>{errorMessage}</p>
            {!priceError && (
              <button
                type="button"
                className="ghost-btn"
                onClick={missingMetadata ? () => window.location.reload() : retry}
              >
                {missingMetadata ? "화면 새로고침" : "다시 시도"}
              </button>
            )}
          </div>
        ) : shown.length ? (
          shown.map((p, i) => <ProductCard key={p.id} product={p} eager={i < 4} />)
        ) : (
          <div className="empty" style={{ gridColumn: "1/-1" }}>
            조건에 맞는 메뉴가 없어요. 검색어나 필터를 줄여보세요.
            <br />
            <button type="button" className="ghost-btn empty-reset" onClick={resetAll}>
              조건 모두 지우기
            </button>
            <Link className="empty-match" href={MATCH_URL}>
              원하는 재료로 직접 만들기 ♡
            </Link>
          </div>
        )}
      </div>
      {!loading && !errorMessage && total > 0 && (
        <nav
          aria-label="메뉴 페이지 이동"
          style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "center", marginTop: 24 }}
        >
          <button
            type="button"
            className="ghost-btn"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            이전
          </button>
          <span aria-live="polite">
            {page} / {totalPages} 페이지
          </span>
          <button
            type="button"
            className="ghost-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            다음
          </button>
        </nav>
      )}
      <aside className="menu-match" aria-label="내 취향 찾기 안내">
        <div>
          <strong>원하는 조합이 없다면?</strong>
          <p>좋아하는 재료에 하트를 보내고 나만의 샐러드를 만들어보세요.</p>
        </div>
        <Link className="primary" href={MATCH_URL}>
          내 취향 찾기 <span>♡</span>
        </Link>
      </aside>
      <p className="ingredient-note">모든 메뉴는 드레싱을 선택할 수 있어요. 음료는 메뉴 선택 후 추가할 수 있습니다.</p>
    </section>
  );
}
