"use client";

import Link from "next/link";
import ReviewCard from "./ReviewCard";
import { useReviewWrite } from "./ReviewWrite";
import { useReviews } from "./ReviewsProvider";
import { newest } from "@/modules/reviews/model";

export default function ProductReviewsPreview({ id }: { id: number }) {
  const list = useReviews().reviewsFor(id);
  const { openWrite } = useReviewWrite();
  const latest = [...list].sort(newest).slice(0, 3);
  return (
    <section className="pvsec" aria-labelledby="pvRvTitle">
      <div className="section-title">
        <div>
          <div className="eyebrow">FRESH WORDS</div>
          <h2 id="pvRvTitle">
            이 메뉴의 리뷰<span>리뷰 {list.length}개</span>
          </h2>
        </div>
        <Link href={`/product/${id}/reviews`}>리뷰 전체 보기 ↗</Link>
      </div>
      <div className="review-cards pv-reviews">
        {latest.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
      <p className="pv-cta">
        <button type="button" className="primary" onClick={() => openWrite(id)}>
          리뷰 쓰기
        </button>
      </p>
    </section>
  );
}
