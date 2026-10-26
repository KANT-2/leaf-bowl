import { MemberAuthError } from "@/features/member/client";
import type { BowlRecipe, BowlRecipeInput } from "./client";

export interface BowlRecipeState {
  items: readonly BowlRecipe[];
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  deletingId: string | null;
  error: string;
  saveError: string;
  deleteError: string;
}

export const EMPTY_BOWL_STATE: BowlRecipeState = {
  items: [],
  loaded: false,
  loading: false,
  saving: false,
  deletingId: null,
  error: "",
  saveError: "",
  deleteError: "",
};

interface RecipeApi {
  list: (signal: AbortSignal) => Promise<BowlRecipe[]>;
  save: (input: BowlRecipeInput, signal: AbortSignal) => Promise<BowlRecipe>;
  remove: (id: string, signal: AbortSignal) => Promise<void>;
}

interface SessionSource {
  key: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : "조합 요청을 처리하지 못했습니다.");

/** 화면 사이에 공유하는 메모리 목록. 브라우저 저장소에 조합을 쓰지 않는다. */
export function createBowlRecipeState(api: RecipeApi, session: SessionSource) {
  let state = EMPTY_BOWL_STATE;
  let owner: string | null = null;
  let epoch = 0;
  let read: { controller: AbortController; promise: Promise<boolean> } | null = null;
  let mutation: AbortController | null = null;
  let unsubscribeSession: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const emit = (next: BowlRecipeState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const stopRead = () => {
    read?.controller.abort();
    read = null;
  };

  const syncSession = () => {
    const next = session.key();
    if (next !== owner) {
      owner = next;
      epoch += 1;
      stopRead();
      mutation?.abort();
      mutation = null;
      emit(EMPTY_BOWL_STATE);
    }
    return next;
  };

  const active = (key: string, version: number) => owner === key && session.key() === key && epoch === version;

  const isCurrentRead = (controller: AbortController) => read?.controller === controller;

  const refresh = (): Promise<boolean> => {
    const key = syncSession();
    if (!key) {
      return Promise.resolve(false);
    }
    if (read) {
      return read.promise;
    }
    const version = epoch;
    const controller = new AbortController();
    emit({ ...state, loading: true, error: "" });
    const pending = (async () => {
      try {
        const items = await api.list(controller.signal);
        if (!active(key, version) || controller.signal.aborted) {
          return false;
        }
        emit({ ...state, items, loaded: true, error: "" });
        return true;
      } catch (cause) {
        if (active(key, version) && !controller.signal.aborted) {
          emit({ ...state, error: message(cause) });
        }
        return false;
      } finally {
        if (isCurrentRead(controller)) {
          read = null;
          if (active(key, version)) {
            emit({ ...state, loading: false });
          }
        }
      }
    })();
    read = { controller, promise: pending };
    return pending;
  };

  const save = async (input: BowlRecipeInput): Promise<BowlRecipe | null> => {
    const key = syncSession();
    if (!key) {
      throw new MemberAuthError();
    }
    if (mutation) {
      return null;
    }
    const version = epoch;
    const controller = new AbortController();
    mutation = controller;
    stopRead();
    emit({ ...state, saving: true, loading: false, saveError: "" });
    try {
      const recipe = await api.save(input, controller.signal);
      if (!active(key, version)) {
        return null;
      }
      // POST 성공을 즉시 반영하고 GET으로 서버의 최신 20개 목록을 확인한다.
      stopRead();
      emit({ ...state, items: [recipe, ...state.items.filter((item) => item.id !== recipe.id)].slice(0, 20) });
      await refresh();
      return active(key, version) ? recipe : null;
    } catch (cause) {
      if (!active(key, version)) {
        return null;
      }
      emit({ ...state, saveError: message(cause) });
      throw cause;
    } finally {
      if (mutation === controller) {
        mutation = null;
        if (active(key, version)) {
          emit({ ...state, saving: false });
        }
      }
    }
  };

  const remove = async (id: string): Promise<boolean> => {
    const key = syncSession();
    if (!key) {
      throw new MemberAuthError();
    }
    if (mutation) {
      return false;
    }
    const version = epoch;
    const controller = new AbortController();
    mutation = controller;
    stopRead();
    emit({ ...state, deletingId: id, loading: false, deleteError: "" });
    try {
      await api.remove(id, controller.signal);
      if (!active(key, version)) {
        return false;
      }
      stopRead();
      emit({ ...state, items: state.items.filter((item) => item.id !== id), error: "" });
      return true;
    } catch (cause) {
      if (!active(key, version)) {
        return false;
      }
      emit({ ...state, deleteError: message(cause) });
      throw cause;
    } finally {
      if (mutation === controller) {
        mutation = null;
        if (active(key, version)) {
          emit({ ...state, deletingId: null });
        }
      }
    }
  };

  const clearSaveError = () => {
    if (state.saveError) {
      emit({ ...state, saveError: "" });
    }
  };

  return {
    getSnapshot: () => (owner === session.key() ? state : EMPTY_BOWL_STATE),
    getServerSnapshot: () => EMPTY_BOWL_STATE,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!unsubscribeSession) {
        unsubscribeSession = session.subscribe(syncSession);
      }
      syncSession();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribeSession?.();
          unsubscribeSession = null;
        }
      };
    },
    refresh,
    save,
    remove,
    clearSaveError,
  };
}
