"use client";

import { useEffect, useSyncExternalStore } from "react";
import { memberTokenStore } from "@/infrastructure/browser/member-token";
import { deleteBowlRecipe, listBowlRecipes, saveBowlRecipe } from "./client";
import { createBowlRecipeState, EMPTY_BOWL_STATE } from "./recipe-state";

// SSRでは getServerSnapshot の空の値だけを使う。取得・更新はブラウザの effect / 操作で開始する。
const recipes = createBowlRecipeState(
  { list: listBowlRecipes, save: saveBowlRecipe, remove: deleteBowlRecipe },
  {
    key: () => {
      const token = memberTokenStore.getSnapshot();
      return token && token.expiresAt > Date.now() ? token.token : null;
    },
    subscribe: memberTokenStore.subscribe,
  },
);

export function useBowlRecipes(enabled: boolean) {
  const state = useSyncExternalStore(recipes.subscribe, recipes.getSnapshot, recipes.getServerSnapshot);
  const token = useSyncExternalStore(
    memberTokenStore.subscribe,
    memberTokenStore.getSnapshot,
    memberTokenStore.getServerSnapshot,
  );
  const signedIn = enabled && !!token;

  useEffect(() => {
    if (enabled && token && !memberTokenStore.current()) {
      return;
    }
    if (!signedIn) {
      return;
    }
    void recipes.refresh();
    const refresh = () => {
      if (!document.hidden && memberTokenStore.current()) {
        void recipes.refresh();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, signedIn, token]);

  const current = signedIn ? state : EMPTY_BOWL_STATE;
  return {
    ...current,
    loading: signedIn && (current.loading || (!current.loaded && !current.error)),
    refresh: () => {
      if (!memberTokenStore.current()) {
        return Promise.resolve(false);
      }
      return recipes.refresh();
    },
    save: recipes.save,
    remove: recipes.remove,
    clearSaveError: recipes.clearSaveError,
  };
}
