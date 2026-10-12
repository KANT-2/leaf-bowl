"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReviewCard from "./ReviewCard";
import { useReviewWrite } from "./ReviewWrite";
import { useReviews } from "./ReviewsProvider";
import { newest } from "@/modules/reviews/model";

const PAGE = 3;

export default function ProductReviewsPreview({ id }: { id: number }) {
  const list = useReviews().reviewsFor(id);
  const { openWrite } = useReviewWrite();
  const [shown, setShown] = useState(PAGE);
  const cardsRef = useRef<HTMLDivElement>(null);
  const focusFrom = useRef<number | null>(null);
  const sorted = [...list].sort(newest);
  const visible = sorted.slice(0, shown);

  // "더 보기" 뒤에는 새로 나타난 첫 리뷰의 제목으로 포커스를 옮긴다.
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null) {
      return;
    }
    focusFrom.current = null;
    const h = cardsRef.current?.children[from]?.querySelector("h3");
    if (h) {
      h.setAttribute("tabindex", "-1");
      (h as HTMLElement).focus();
    }
  }, [shown]);

  return (
    <section className="pvsec" id="reviews" aria-labelledby="pvRvTitle">
      <div className="section-title">
        <div>
          <div className="eyebrow">FRESH WORDS</div>
          <h2 id="pvRvTitle">
            이 메뉴의 리뷰<span>리뷰 {list.length}개</span>
          </h2>
        </div>
        <Link href={`/product/${id}/reviews`}>리뷰 전체 보기 ↗</Link>
      </div>
      <div className="review-cards pv-reviews" ref={cardsRef}>
        {visible.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
      {visible.length < sorted.length && (
        <div className="rv-more">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              focusFrom.current = visible.length;
              setShown((n) => n + PAGE);
            }}
          >
            리뷰 더 보기{" "}
            <span>
              ({visible.length} / {sorted.length})
            </span>
          </button>
        </div>
      )}
      <p className="pv-cta">
        <button type="button" className="primary" onClick={() => openWrite(id)}>
          리뷰 쓰기
        </button>
      </p>
    </section>
  );
}
