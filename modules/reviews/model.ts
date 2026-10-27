import { kstDate } from "@/modules/shared/time";

/** 리뷰 한 개에 올릴 수 있는 사진 수 */
export const REVIEW_PHOTO_MAX = 3;

/** 「내 취향 볼」 리뷰의 메뉴 번호. 상품이 아니라서 메뉴 번호(0 이상)와 겹치지 않는 값을 쓴다 */
export const CUSTOM_BOWL_PID = -1;
export const CUSTOM_BOWL_NAME = "내 취향 볼";
/** 내 취향 볼 리뷰만 모아 보는 주소 */
export const CUSTOM_BOWL_REVIEWS_PATH = "/reviews/custom-bowl";
/** 리뷰 menu 칸 길이 (reviews.menu VARCHAR(120)) */
const MENU_MAX = 120;

/**
 * 내 취향 볼 리뷰의 menu 값: 「내 취향 볼 (재료, 재료, …)」. 주문 당시 고른 재료를 남긴다.
 * 관리자 화면은 " · " 의 마지막 칸을 픽업·배달로 읽으므로 재료는 괄호 안에 쉼표로 둔다.
 */
export function customBowlMenu(choices: readonly string[]): string {
  const names = choices.map((c) => c.trim()).filter(Boolean);
  if (!names.length) {
    return CUSTOM_BOWL_NAME;
  }
  const full = `${CUSTOM_BOWL_NAME} (${names.join(", ")})`;
  if ([...full].length <= MENU_MAX) {
    return full;
  }
  const room = MENU_MAX - [...`${CUSTOM_BOWL_NAME} (…)`].length;
  return `${CUSTOM_BOWL_NAME} (${[...names.join(", ")].slice(0, room).join("")}…)`;
}

/** 내 취향 볼 리뷰의 menu 이면 고른 재료 문구(없으면 ""), 아니면 null */
export function customBowlChoices(menu: string): string | null {
  if (menu === CUSTOM_BOWL_NAME) {
    return "";
  }
  const prefix = `${CUSTOM_BOWL_NAME} (`;
  return menu.startsWith(prefix) && menu.endsWith(")") ? menu.slice(prefix.length, -1) : null;
}

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
  /** 이 리뷰를 쓴 계정 이메일 (이 브라우저에 저장된 리뷰에만 있음, 서버로 보내지 않는다) */
  ownerEmail?: string;
  /** 내 취향 볼 리뷰(pid = CUSTOM_BOWL_PID)에서 주문 당시 고른 재료 */
  choices?: string;
  /** 이 리뷰가 달린 주문 품목 id (같은 구매를 중복으로 리뷰하지 못하게 막는 데 쓴다, 서버로 보내지 않는다) */
  orderItemId?: string;
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
  return Number.isFinite(new Date(review.t).getTime()) && review.t !== 0 ? dateStr(review.t) : review.date;
}

export const RATE_LABELS = ["", "아쉬워요", "별로예요", "보통이에요", "좋아요", "최고예요"];
