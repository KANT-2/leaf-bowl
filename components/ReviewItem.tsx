"use client";
import Link from "next/link";
import FoodImage from "./FoodImage";
import ReviewPhotos from "./ReviewPhotos";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { reviewDisplayDate, type Review } from "@/modules/reviews/model";

/** 리뷰 목록의 한 줄. showMenu 가 true 면(전체 리뷰) 어떤 메뉴의 리뷰인지 사진과 이름을 붙인다. */
export default function ReviewItem({ review: r, showMenu }: { review: Review; showMenu: boolean }) {
  const { getProduct } = useCustomerCatalog();
  const p = getProduct(r.pid);
  return (
    <li className={`rv-item${r.mine ? " is-mine" : ""}`}>
      <div className="rv-item-top">
        <span className="review-stars" role="img" aria-label={`별점 5점 만점에 ${r.stars}점`}>
          {"★".repeat(r.stars)}
          <span className="empty-star" aria-hidden="true">
            {"★".repeat(5 - r.stars)}
          </span>
        </span>
        <time className="rv-date">{reviewDisplayDate(r)}</time>
      </div>
      <h3>{r.title}</h3>
      <p>{r.text}</p>
      <ReviewPhotos photos={r.images} label={`${r.title} 리뷰 사진`} />
      <div className="rv-item-meta">
        {showMenu && p && (
          <Link className="rv-item-menu" href={`/product/${p.id}`}>
            <span className="rv-item-thumb">
              <FoodImage id={p.id} sizes="28px" />
            </span>
            {p.name}
          </Link>
        )}
        <span>{r.author}</span>
        <span className={r.mine ? "rv-mine" : ""}>{r.mine ? "내가 작성" : "고객 리뷰"}</span>
      </div>
    </li>
  );
}
