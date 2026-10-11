"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FoodImage from "./FoodImage";
import ReviewCard from "./ReviewCard";
import { useReviews } from "./ReviewsProvider";
import StarRating from "./StarRating";
import { useReducedMotion } from "@/features/shared/hooks";

import { newest } from "@/modules/reviews/model";

/** 다음 제품으로 넘어가기까지의 시간 (밀리초) */
export const ROTATE_MS = 6000;


const two = (n: number) => String(n).padStart(2, "0");

export default function ReviewRotator() {
  const { visibleProducts: PRODUCTS } = useCustomerCatalog();
  const TOTAL = PRODUCTS.length;
  const { reviewsFor, statsFor } = useReviews();
  const reduced = useReducedMotion();
  // 첫 렌더는 서버와 같게 항상 첫 번째 제품
  const [index, setIndex] = useState(0);
  // 같은 점을 다시 눌러도 진행 시간을 0으로 되돌리기 위한 카운터
  const [cycle, setCycle] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageHidden, setPageHidden] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dots = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((en) => setVisible(en[0].isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const go = (n: number) => {
    setIndex((n + TOTAL) % TOTAL);
    setCycle((c) => c + 1);
    setAnimate(true);
  };

  const onDotKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + TOTAL) % TOTAL;
    go(next);
    dots.current[next]?.focus();
  };

  const paused = hover || focus || !visible || pageHidden;
  const p = PRODUCTS[index % Math.max(TOTAL,1)];
  if (!p) return null;
  const s = statsFor(p.id);
  const list = [...reviewsFor(p.id)].sort(newest).slice(0, 3);

  return (
    <>
      <div className="section-title">
        <div>
          <div className="eyebrow">FRESH WORDS, HAPPY BOWLS</div>
          <h2 id="reviewsTitle">한 그릇에 담긴 좋은 이야기</h2>
        </div>
        {/* 지금 보이는 제품의 리뷰 페이지로 이동 */}
        <Link className="rs-link ghost rs-all" href={`/product/${p.id}/reviews`} aria-label={`${p.name} 리뷰 전체 보기`}>
          리뷰 전체 보기
        </Link>
      </div>
      <div
        ref={box}
        className={`rs${paused ? " paused" : ""}`}
        role="group"
        aria-roledescription="carousel"
        aria-label="제품별 고객 리뷰"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        // 키보드 포커스일 때만 멈춘다. 마우스로 점을 누르면 버튼에 포커스가 남는데, 이걸 멈춤으로 치면 자동 전환이 다시 시작되지 않는다.
        onFocus={(e) => setFocus(e.target.matches(":focus-visible"))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
        }}
      >
        <div key={`${index}-${cycle}`} className={`rs-stage${animate && !reduced ? " is-in" : ""}`}>
          <div className="rs-product">
            <div className="rs-head">
              <Link className="rs-photo" href={`/product/${p.id}`} tabIndex={-1} aria-hidden="true">
                <FoodImage id={p.id} sizes="140px" eager />
              </Link>
              <div className="rs-info">
                <span className="small-label">
                  REVIEW {two(index + 1)} / {two(TOTAL)}
                </span>
                <h3>
                  <Link href={`/product/${p.id}`} aria-label={`${p.name} 메뉴 보기`}>
                    {p.name}
                  </Link>
                </h3>
                <div className="rating-score">
                  <strong>{s.avg.toFixed(1)}</strong>
                  <span>/ 5</span>
                </div>
                <StarRating avg={s.avg} size="sm" />
                <p>리뷰 {s.n}개 기준</p>
              </div>
            </div>
          </div>
          <div className="review-cards">
            {list.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </div>
        {!reduced && (
          <div className="rs-bar" aria-hidden="true">
            <span
              key={`${index}-${cycle}`}
              style={{ animationDuration: `${ROTATE_MS}ms` }}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) go(index + 1);
              }}
            />
          </div>
        )}
        <div className="rs-dots">
          {PRODUCTS.map((d, n) => (
            <button
              key={d.id}
              ref={(el) => {
                dots.current[n] = el;
              }}
              type="button"
              className={n === index ? "on" : ""}
              aria-label={`${d.name} 리뷰 보기`}
              aria-current={n === index ? "true" : undefined}
              title={d.name}
              onClick={() => go(n)}
              onKeyDown={onDotKey}
            />
          ))}
        </div>
      </div>
    </>
  );
}
