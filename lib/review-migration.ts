import type { Review } from "./reviews";

/** 성공한 ID만 기록한다. 일시 실패는 최대 30초 간격으로 재시도한다. */
export function startReviewMigration(
  reviews: Review[],
  migrated: Set<string>,
  send: (review: Review, signal: AbortSignal) => Promise<boolean>,
  onSaved: () => void,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  async function run() {
    for (const review of reviews) {
      if (controller.signal.aborted) return;
      if (migrated.has(review.id)) continue;
      try {
        if (await send(review, controller.signal)) {
          migrated.add(review.id);
          if (!controller.signal.aborted) onSaved();
        }
      } catch {
        // 취소·네트워크 실패는 ID를 성공 처리하지 않는다.
      }
    }
    if (!controller.signal.aborted && reviews.some((r) => !migrated.has(r.id))) {
      timer = setTimeout(() => void run(), Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)));
    }
  }
  void run();
  return () => {
    controller.abort();
    if (timer !== undefined) clearTimeout(timer);
  };
}
