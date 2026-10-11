"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import FoodImage from "./FoodImage";
import PageHeading from "./PageHeading";
import ReviewItem from "./ReviewItem";
import { useReviewWrite } from "./ReviewWrite";
import { useReviews } from "./ReviewsProvider";
import StarRating from "./StarRating";
import { useReducedMotion } from "@/features/shared/hooks";
import {useCustomerCatalog} from "./CustomerCatalogProvider";
import { money } from "@/modules/shared/format";
import { SORTERS, SORT_LABELS, statsOf, type SortKey } from "@/modules/reviews/model";

const PAGE = 10;

/**
 * 고객 리뷰 화면. /reviews(전체 메뉴, pid=null)와 /product/[id]/reviews(한 메뉴)가 함께 쓴다.
 * 메뉴를 바꾸면 해당 주소로 이동하고, 별점 막대를 누르면 그 별점만 걸러 본다.
 */
export default function ReviewsView({ pid }: { pid: number | null }) {
  const { allReviews, reviewsFor } = useReviews();
  const { openWrite } = useReviewWrite();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [sort, setSort] = useState<SortKey>("new");
  const [shown, setShown] = useState(PAGE);
  // 별점 걸러 보기 (null = 전체)
  const [star, setStar] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const writeBtn = useRef<HTMLButtonElement>(null);
  const focusFrom = useRef<number | null>(null);

  const {visibleProducts: PRODUCTS, getProduct}=useCustomerCatalog();
  const product = pid === null ? null : getProduct(pid);
  const all = pid === null ? allReviews : reviewsFor(pid);
  const s = statsOf(all);
  const list = all.filter((r) => star === null || r.stars === star).sort(SORTERS[sort]);
  const visible = list.slice(0, shown);

  const pickStar = (k: number | null) => {
    setStar((cur) => (cur === k ? null : k));
    setShown(PAGE);
  };

  // "더 보기" 뒤에는 새로 나타난 첫 리뷰의 제목으로 포커스를 옮긴다.
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null) return;
    focusFrom.current = null;
    const h = listRef.current?.children[from]?.querySelector("h3");
    if (h) {
      h.setAttribute("tabindex", "-1");
      h.focus();
    }
  }, [shown]);

  const write = () =>
    openWrite(pid, {
      onAdded: () => {
        setSort("new");
        setStar(null);
        setShown(PAGE);
        toolbarRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      },
    });

  // 예전 "#write" 링크로 들어오면 리뷰 쓰기 모달을 바로 연다.
  useEffect(() => {
    if (location.hash !== "#write") return;
    const t = setTimeout(() => {
      history.replaceState(history.state, "", location.pathname);
      writeBtn.current?.click();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const changeMenu = (value: string) => router.push(value === "" ? "/reviews" : `/product/${value}/reviews`);

  return (
    <div className="rv">
      <div className="rv-head">
        <div>
          <span className="eyebrow">CUSTOMER REVIEWS</span>
          <PageHeading>{product ? <>{product.name} <span>리뷰</span></> : "고객 리뷰"}</PageHeading>
        </div>
        <button type="button" ref={writeBtn} className="primary rv-write-btn" onClick={write}>
          리뷰 쓰기
        </button>
      </div>

      <section className={`rv-sum${product ? " has-product" : ""}`} aria-label="평점 요약">
        <div className="rv-score">
          <strong>{s.avg.toFixed(1)}</strong>
          <div>
            <StarRating avg={s.avg} />
            <p>리뷰 {s.n}개</p>
          </div>
        </div>
        <ul className="dist" aria-label="별점별 걸러 보기">
          {[5, 4, 3, 2, 1].map((k) => (
            <li key={k}>
              <button
                type="button"
                className="dist-row"
                aria-pressed={star === k}
                aria-label={`${k}점 리뷰 ${s.dist[k]}개만 보기`}
                onClick={() => pickStar(k)}
              >
                <span>{k}점</span>
                <i>
                  <b style={{ width: `${s.n ? ((s.dist[k] / s.n) * 100).toFixed(1) : 0}%` }} />
                </i>
                <em>{s.dist[k]}</em>
              </button>
            </li>
          ))}
        </ul>
        {product && (
          <Link className="rv-product" href={`/product/${product.id}`}>
            <span className="rv-thumb">
              <FoodImage id={product.id} sizes="64px" preload />
            </span>
            <span>
              <b>{product.name}</b>
              {money(product.price)}
              <i>메뉴 보기 →</i>
            </span>
          </Link>
        )}
      </section>

      <div className="rv-toolbar" ref={toolbarRef}>
        <label className="rv-menu">
          <span>메뉴</span>
          <select value={pid ?? ""} onChange={(e) => changeMenu(e.target.value)}>
            <option value="">전체 메뉴</option>
            {PRODUCTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {star !== null && (
          <button type="button" className="rv-filter" onClick={() => pickStar(null)} aria-label={`${star}점 필터 해제`}>
            ★ {star}점 <span aria-hidden="true">✕</span>
          </button>
        )}
        <span className="rv-count" aria-live="polite">
          {list.length}개
        </span>
        <label className="rv-sort">
          <span className="sr-only">정렬</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setShown(PAGE);
            }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.length > 0 ? (
        <ol className="rv-list" ref={listRef}>
          {visible.map((r) => (
            <ReviewItem key={r.id} review={r} showMenu={pid === null} />
          ))}
        </ol>
      ) : (
        <div className="empty rv-empty">
          {star !== null ? (
            <>
              아직 {star}점 리뷰가 없어요.
              <button type="button" className="ghost-btn" onClick={() => pickStar(null)}>
                필터 해제
              </button>
            </>
          ) : (
            <>
              아직 리뷰가 없어요. 첫 리뷰를 남겨주세요.
              <button type="button" className="ghost-btn" onClick={write}>
                리뷰 쓰기
              </button>
            </>
          )}
        </div>
      )}

      {visible.length < list.length && (
        <div className="rv-more">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              focusFrom.current = visible.length;
              setShown((n) => n + PAGE);
            }}
          >
            리뷰 더 보기 <span>({visible.length} / {list.length})</span>
          </button>
        </div>
      )}
    </div>
  );
}
