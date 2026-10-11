interface Props {
  avg: number;
  size?: "sm" | "md";
}

/** 평균 점수만큼 채워지는 별 5개. 화면 읽기에는 한 문장으로 읽힌다. */
export default function StarRating({ avg, size = "md" }: Props) {
  return (
    <span
      className={`rating-stars${size === "sm" ? " sm" : ""}`}
      role="img"
      aria-label={`별점 5점 만점에 ${avg.toFixed(1)}점`}
    >
      <span aria-hidden="true">★★★★★</span>
      <span className="stars-fill" style={{ width: `${((avg / 5) * 100).toFixed(2)}%` }} aria-hidden="true">
        ★★★★★
      </span>
    </span>
  );
}
