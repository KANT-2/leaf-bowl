"use client";
import Link from "next/link";
import FoodImage from "./FoodImage";
import ReviewPhotos from "./ReviewPhotos";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import {
  CUSTOM_BOWL_NAME,
  CUSTOM_BOWL_PID,
  CUSTOM_BOWL_REVIEWS_PATH,
  reviewDisplayDate,
  type Review,
} from "@/modules/reviews/model";

/**
 * 리뷰 목록의 한 줄. showMenu 가 true 면(전체 리뷰) 어떤 메뉴의 리뷰인지 사진과 이름을 붙인다.
 * 내 취향 볼 리뷰는 주문 당시 고른 재료를 함께 보여 준다.
 */
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
      {r.choices && <p className="rv-item-choices">고른 재료 · {r.choices}</p>}
      <ReviewPhotos photos={r.images} label={`${r.title} 리뷰 사진`} />
      <div className="rv-item-meta">
        {showMenu && r.pid === CUSTOM_BOWL_PID && (
          <Link className="rv-item-menu" href={CUSTOM_BOWL_REVIEWS_PATH}>
            {CUSTOM_BOWL_NAME}
          </Link>
        )}
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
