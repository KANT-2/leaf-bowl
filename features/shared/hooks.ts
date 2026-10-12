import { useSyncExternalStore } from "react";
import { reducedMotionStore } from "@/infrastructure/browser/local-store";

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    reducedMotionStore.subscribe,
    reducedMotionStore.getSnapshot,
    reducedMotionStore.getServerSnapshot,
  );
}
