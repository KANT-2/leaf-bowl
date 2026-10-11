import { kstDate } from "@/modules/shared/time";

/** 리뷰 한 개에 올릴 수 있는 사진 수 */
export const REVIEW_PHOTO_MAX = 3;

export type Via = "pickup" | "delivery";
export type SortKey = "new" | "high" | "low";

export interface Review {
  id: string;
  images?: string[];
  pid: number;
  author: string;
  stars: number;
  title: string;
  text: string;
  /** 표시용 날짜 (YYYY.MM.DD) */
  date: string;
  via: Via;
  /** 정렬용 시각 (ms) */
  t: number;
  sample: boolean;
  mine?: boolean;
}

export interface ReviewStats {
  n: number;
  avg: number;
  /** 인덱스 1~5에 점수별 개수 */
  dist: number[];
}

export const SORT_LABELS: Record<SortKey, string> = {
  new: "최신순",
  high: "별점 높은순",
  low: "별점 낮은순",
};

export const newest = (a: Review, b: Review) => b.t - a.t;
export const SORTERS: Record<SortKey, (a: Review, b: Review) => number> = {
  new: newest,
  high: (a, b) => b.stars - a.stars || b.t - a.t,
  low: (a, b) => a.stars - b.stars || b.t - a.t,
};

export function statsOf(list: Review[]): ReviewStats {
  const dist = [0, 0, 0, 0, 0, 0];
  list.forEach((r) => dist[r.stars]++);
  const n = list.length;
  return { n, avg: n ? list.reduce((s, r) => s + r.stars, 0) / n : 0, dist };
}

export function dateStr(t: number): string {
  return kstDate(t).replaceAll("-", ".");
}

/** Timestamp wins over cached display text, including dates saved by older clients. */
export function reviewDisplayDate(review: Pick<Review, "t" | "date">): string {
  return Number.isFinite(new Date(review.t).getTime()) && review.t !== 0
    ? dateStr(review.t)
    : review.date;
}

export const RATE_LABELS = [
  "",
  "아쉬워요",
  "별로예요",
  "보통이에요",
  "좋아요",
  "최고예요",
];
