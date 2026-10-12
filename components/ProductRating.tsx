"use client";

import Link from "next/link";
import { useReviews } from "./ReviewsProvider";
import StarRating from "./StarRating";

export default function ProductRating({ id }: { id: number }) {
  const s = useReviews().statsFor(id);
  return (
    <Link className="pv-rate" href="#reviews">
      <StarRating avg={s.avg} size="sm" />
      <span>
        <b>{s.avg.toFixed(1)}</b> · 리뷰 {s.n}개 <i aria-hidden="true">›</i>
      </span>
    </Link>
  );
}
