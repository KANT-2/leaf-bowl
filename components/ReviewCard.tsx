"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import ReviewPhotos from "./ReviewPhotos";
import { reviewDisplayDate, type Review } from "@/modules/reviews/model";

export default function ReviewCard({ review: r }: { review: Review }) {
  const { PRODUCTS } = useCustomerCatalog();
  return (
    <article className={`review-card${r.mine ? " is-mine" : ""}`}>
      <div className="review-top">
        <span className="review-stars" role="img" aria-label={`별점 5점 만점에 ${r.stars}점`}>
          {"★".repeat(r.stars)}
          {r.stars < 5 && (
            <span className="empty-star" aria-hidden="true">
              {"★".repeat(5 - r.stars)}
            </span>
          )}
        </span>
        <span>{r.stars}.0</span>
      </div>
      <h3>{r.title}</h3>
      <p>{r.text}</p>
      <ReviewPhotos photos={r.images} label={`${r.title} 리뷰 사진`} size={72} />
      <span className="review-menu">{PRODUCTS[r.pid]?.name ?? "삭제된 메뉴"}</span>
      <div className="review-author">
        <span className="review-avatar" aria-hidden="true">
          {[...r.author][0] || "익"}
        </span>
        <span>
          {r.author}
          <small>
            {reviewDisplayDate(r)} · {r.mine ? "내가 작성" : r.sample ? "예시 리뷰" : "고객 리뷰"}
          </small>
        </span>
      </div>
    </article>
  );
}
