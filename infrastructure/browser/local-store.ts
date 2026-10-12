/**
 * localStorage 한 키를 감싸는 작은 외부 저장소.
 * useSyncExternalStore 와 함께 쓰면 서버/하이드레이션 중에는 `empty` 를,
 * 마운트 이후에는 브라우저에 저장된 값을 렌더하므로 하이드레이션 불일치가 생기지 않는다.
 */
export interface LocalStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (next: T) => void;
}

export function createLocalStore<T>(key: string, load: () => T, save: (v: T) => void, empty: T): LocalStore<T> {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const onStorage = (e: StorageEvent) => {
    if (e.key !== key && e.key !== null) {
      return;
    }
    value = load();
    emit();
  };

  return {
    subscribe(listener) {
      if (listeners.size === 0) {
        window.addEventListener("storage", onStorage);
        // 구독자가 없던 동안 발생한 다른 탭의 변경도 반영한다.
        value = load();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          window.removeEventListener("storage", onStorage);
        }
      };
    },
    getSnapshot() {
      if (value === undefined) {
        value = load();
      }
      return value;
    },
    getServerSnapshot: () => empty,
    set(next) {
      value = next;
      save(next);
      emit();
    },
  };
}

const noop = () => () => {};

/** prefers-reduced-motion 구독용 (서버에서는 false). */
export const reducedMotionStore = {
  subscribe(listener: () => void) {
    if (typeof window === "undefined" || !window.matchMedia) {
      return noop();
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  },
  getSnapshot: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  getServerSnapshot: () => false,
};
