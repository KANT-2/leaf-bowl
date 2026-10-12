import { normalizeUTC, legacyKSTUTC } from "@/modules/shared/time";
import { readBrowserJSON as read, writeBrowserJSON as write } from "@/infrastructure/browser/json";
import type { Decision, SavedRecipe } from "@/modules/bowl/model";
import { createLocalStore, type LocalStore } from "@/infrastructure/browser/local-store";
import { dressingKey as recipeDressingKey } from "@/modules/cart/identifiers";

/* ---- 브라우저 저장 ("내 조합 저장하기" 결과만 예전과 같은 localStorage 키를 그대로 쓴다) ---- */

const RECIPE_KEY = "bm-recipe";

function parseRecipe(r: unknown): SavedRecipe | null {
  if (typeof r !== "object" || r === null) {
    return null;
  }
  const { id, name, ingredients, dressing, price, savedAt, ownerEmail } = r as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    !Array.isArray(ingredients) ||
    !ingredients.every((i) => typeof i === "string") ||
    typeof dressing !== "number" ||
    dressing < -1 ||
    !Number.isInteger(dressing) ||
    (ownerEmail !== undefined && typeof ownerEmail !== "string")
  ) {
    return null;
  }
  const key = (r as SavedRecipe).dressingKey;
  if (key !== undefined && (typeof key !== "string" || !key || key.length > 80)) {
    return null;
  }
  return {
    id,
    name: name.slice(0, 30),
    ingredients,
    dressing,
    dressingKey: recipeDressingKey({ dressing, dressingKey: key }),
    price: Number(price) || 0,
    savedAt: normalizeUTC(savedAt) ?? legacyKSTUTC(savedAt) ?? "",
    ownerEmail,
  };
}

/** 예전엔 조합 하나만 저장했다. 배열이 아니면 옛 형식이라 보고 통째로 버린다(계정에 연결된 적 없는 데이터라 되살릴 수 없다). */
function loadRecipes(): SavedRecipe[] {
  const raw = read(RECIPE_KEY);
  return Array.isArray(raw) ? raw.map(parseRecipe).filter((r): r is SavedRecipe => r !== null) : [];
}

const NO_DECISIONS: Decision[] = [];

/** 저장(localStorage) 없이 메모리에서만 유지하는 외부 저장소. 새로고침하면 비워진다. */
function createMemoryStore<T>(empty: T): LocalStore<T> {
  let value = empty;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => value,
    getServerSnapshot: () => empty,
    set(next) {
      value = next;
      listeners.forEach((l) => l());
    },
  };
}

// 재료 고르기 진행 상황은 이번 방문에서만 유지한다 ("내 조합 저장하기"로 남긴 조합과는 다르게,
// 다른 페이지로 갔다 오거나 새로고침하면 새로 시작한다).
export const decisionsStore = createMemoryStore<Decision[]>(NO_DECISIONS);
const NO_RECIPES: SavedRecipe[] = [];
export const recipeStore = createLocalStore<SavedRecipe[]>(
  RECIPE_KEY,
  loadRecipes,
  (list) =>
    write(
      RECIPE_KEY,
      list.map((v) => ({ ...v, savedAt: normalizeUTC(v.savedAt) ?? legacyKSTUTC(v.savedAt) ?? "" })),
    ),
  NO_RECIPES,
);
