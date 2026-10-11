import { dateStr, type Review } from "./reviews";

type Draft = Pick<Review, "pid" | "author" | "stars" | "title" | "text" | "via">;

/** 응답을 잃어도 같은 내용은 동일 ID로 재전송한다. */
export function createReviewSubmission() {
  let pending: { fingerprint: string; review: Review } | undefined;
  return (draft: Draft, photos: string[] = []): Review => {
    const fingerprint = JSON.stringify([draft, photos]);
    if (pending?.fingerprint === fingerprint) return pending.review;
    const now = Date.now();
    const review: Review = { ...draft, id: `u-${crypto.randomUUID()}`, date: dateStr(now), t: now, sample: false, mine: true };
    pending = { fingerprint, review };
    return review;
  };
}
