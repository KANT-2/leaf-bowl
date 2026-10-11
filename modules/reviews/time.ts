import { kstDate, legacyKSTUTC, normalizeUTC } from "@/modules/shared/time";

type ReviewTime = { date: string; createdAt?: string };

export function reviewTimestamp(review: ReviewTime): number | null {
  const instant = normalizeUTC(review.createdAt) ?? legacyKSTUTC(review.date);
  return instant ? Date.parse(instant) : null;
}

/** Preserve legacy labels without inventing an instant for an unknown date. */
export function normalizeReviewTime<T extends ReviewTime>(review: T): T {
  const ms = reviewTimestamp(review);
  return ms === null
    ? review
    : {
        ...review,
        createdAt: new Date(ms).toISOString(),
        date: kstDate(ms).replaceAll("-", "."),
      };
}
