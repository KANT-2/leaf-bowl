"use client";

import { useCustomerCatalog, notifyCatalogSaved } from "./CustomerCatalogProvider";
import { createContext, useCallback, useContext, useMemo, useEffect, useRef, useSyncExternalStore } from "react";
import { startReviewMigration } from "@/lib/review-migration";
import { createLocalStore } from "@/lib/local-store";
import { statsOf, type Review, type ReviewStats } from "@/lib/reviews";
import { REVIEW_KEY, loadUserReviews, saveUserReviews } from "@/lib/storage";

const EMPTY: Review[] = [];
const store = createLocalStore<Review[]>(REVIEW_KEY, loadUserReviews, saveUserReviews, EMPTY);

interface ReviewsContextValue {
  userReviews: Review[];
  /** 모든 메뉴의 리뷰 */
  allReviews: Review[];
  reviewsFor: (pid: number) => Review[];
  statsFor: (pid: number) => ReviewStats;
  /** 리뷰를 서버에 등록한다. photos 는 브라우저에서 줄인 사진(data: 주소)이며 서버가 파일로 저장한다. */
  addReview: (review: Review, photos?: string[]) => Promise<void>;
}

const ReviewsContext = createContext<ReviewsContextValue | null>(null);

export function useReviews(): ReviewsContextValue {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error("useReviews must be used inside <ReviewsProvider>");
  return ctx;
}

export default function ReviewsProvider({ children }: { children: React.ReactNode }) {
  const {reviews}=useCustomerCatalog();
  const userReviews = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);


  const migrated = useRef(new Set<string>());
  useEffect(() => startReviewMigration(
    userReviews.filter((review) => !reviews.some((r) => r.id === review.id)),
    migrated.current,
    async (review, signal) => {
      const response = await fetch("/api/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review), signal,
      });
      return response.ok;
    },
    notifyCatalogSaved,
  ), [userReviews, reviews]);

  const allReviews = useMemo(() => {
    const mine = new Set(userReviews.map((r) => r.id));
    return reviews.map((r) => ({ ...r, mine: mine.has(r.id) }));
  }, [reviews, userReviews]);
  const reviewsFor = useCallback((pid: number) => allReviews.filter((r) => r.pid === pid), [allReviews]);
  const statsFor = useCallback((pid: number) => statsOf(reviewsFor(pid)), [reviewsFor]);
  const addReview = useCallback(async (review: Review, photos: string[] = []) => {
    const response=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...review,photos})});
    if(!response.ok)throw Error('리뷰를 저장하지 못했습니다. 다시 시도해주세요.');
    migrated.current.add(review.id);
    store.set([review,...store.getSnapshot().filter(r => r.id !== review.id)]);notifyCatalogSaved();
  }, []);


  const value = useMemo(
    () => ({ userReviews, allReviews, reviewsFor, statsFor, addReview }),
    [userReviews, allReviews, reviewsFor, statsFor, addReview],
  );
  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
}
