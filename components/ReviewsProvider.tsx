"use client";

import { useAuth } from "./AuthProvider";
import { useCustomerCatalog, notifyCatalogSaved } from "./CustomerCatalogProvider";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useSyncExternalStore,
  useState,
} from "react";
import { startReviewMigration } from "@/features/reviews/migration";
import { createLocalStore } from "@/infrastructure/browser/local-store";
import { statsOf, type Review, type ReviewStats } from "@/modules/reviews/model";
import { REVIEW_KEY, loadUserReviews, saveUserReviews } from "@/infrastructure/browser/review-storage";

const EMPTY: Review[] = [];
const store = createLocalStore<Review[]>(REVIEW_KEY, loadUserReviews, saveUserReviews, EMPTY);

interface ReviewsContextValue {
  userReviews: Review[];
  reviewedOrderItemIds: ReadonlySet<string>;
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
  if (!ctx) {
    throw new Error("useReviews must be used inside <ReviewsProvider>");
  }
  return ctx;
}

export default function ReviewsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { reviews } = useCustomerCatalog();
  const cachedReviews = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [submissions, setSubmissions] = useState<{ reviewId: string; orderItemId: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reviews", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) {
          setSubmissions(
            Array.isArray(body?.submissions)
              ? body.submissions.filter(
                  (r: { reviewId?: unknown; orderItemId?: unknown }) =>
                    typeof r.reviewId === "string" && typeof r.orderItemId === "string",
                )
              : [],
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [reviews, user]);
  const reviewedOrderItemIds = useMemo(() => new Set(submissions.map((s) => s.orderItemId)), [submissions]);
  const userReviews = useMemo(() => {
    const owned = new Map(submissions.map((s) => [s.reviewId, s.orderItemId]));
    return reviews
      .filter((r) => owned.has(r.id))
      .map((r) => ({
        ...r,
        mine: true,
        ownerEmail: user?.email,
        orderItemId: owned.get(r.id),
      }));
  }, [reviews, submissions, user]);

  const migrated = useRef(new Set<string>());
  useEffect(
    () =>
      startReviewMigration(
        cachedReviews.filter((review) => review.orderItemId && !reviews.some((r) => r.id === review.id)),
        migrated.current,
        async (review, signal) => {
          const response = await fetch("/api/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(review),
            signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
          });
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            migrated.current.add(review.id);
          }
          return response.ok;
        },
        notifyCatalogSaved,
      ),
    [cachedReviews, reviews],
  );

  const allReviews = useMemo(() => {
    // 서버가 확인한 주문 세션의 제출 이력만 내 리뷰로 표시한다.
    const mine = new Set(userReviews.map((r) => r.id));
    return reviews.map((r) => ({ ...r, mine: mine.has(r.id) }));
  }, [reviews, userReviews]);
  const reviewsFor = useCallback((pid: number) => allReviews.filter((r) => r.pid === pid), [allReviews]);
  const statsFor = useCallback((pid: number) => statsOf(reviewsFor(pid)), [reviewsFor]);
  const addReview = useCallback(async (review: Review, photos: string[] = []) => {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...review, photos }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw Error(typeof error?.error === "string" ? error.error : "리뷰를 저장하지 못했습니다. 다시 시도해주세요.");
    }
    migrated.current.add(review.id);
    if (review.orderItemId) {
      setSubmissions((current) => [
        { reviewId: review.id, orderItemId: review.orderItemId! },
        ...current.filter((s) => s.orderItemId !== review.orderItemId),
      ]);
    }
    store.set([review, ...store.getSnapshot().filter((r) => r.id !== review.id)]);
    notifyCatalogSaved();
  }, []);

  const value = useMemo(
    () => ({ userReviews, reviewedOrderItemIds, allReviews, reviewsFor, statsFor, addReview }),
    [userReviews, reviewedOrderItemIds, allReviews, reviewsFor, statsFor, addReview],
  );
  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
}
