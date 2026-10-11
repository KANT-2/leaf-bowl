import {
  readBrowserJSON as readJSON,
  writeBrowserJSON as writeJSON,
} from "./json";
import { reviewDisplayDate, type Review } from "@/modules/reviews/model";
import { isRecord, isProductId } from "@/modules/shared/validation";
export const REVIEW_KEY = "bb-user-reviews";
function isStoredReview(v: unknown): v is Review {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    isProductId(v.pid) &&
    typeof v.stars === "number" &&
    Number.isInteger(v.stars) &&
    v.stars >= 1 &&
    v.stars <= 5 &&
    typeof v.title === "string" &&
    typeof v.text === "string" &&
    typeof v.author === "string" &&
    (v.via === "pickup" || v.via === "delivery") &&
    typeof v.t === "number" &&
    Number.isFinite(v.t)
  );
}

export function loadUserReviews(): Review[] {
  const raw = readJSON(REVIEW_KEY);
  return Array.isArray(raw)
    ? raw.filter(isStoredReview).map((r) => ({
        id: r.id,
        pid: r.pid,
        author: r.author,
        stars: r.stars,
        title: r.title,
        text: r.text,
        via: r.via,
        t: r.t,
        date: reviewDisplayDate({
          t: r.t,
          date: typeof r.date === "string" ? r.date : "",
        }),
        sample: false,
        mine: true,
      }))
    : [];
}

export function saveUserReviews(list: Review[]) {
  writeJSON(
    REVIEW_KEY,
    list.map(({ id, pid, author, stars, title, text, date, via, t }) => ({
      id,
      pid,
      author,
      stars,
      title,
      text,
      date: reviewDisplayDate({ t, date }),
      via,
      t,
    })),
  );
}
