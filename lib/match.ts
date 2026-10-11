import { readBrowserJSON as read, writeBrowserJSON as write } from "./browser-json";
import type { Ingredient, Stage } from "./data/ingredients";
import { createLocalStore, type LocalStore } from "./local-store";
import { dressingKey as recipeDressingKey } from "./cart-identifiers";

/** 재료를 하나도 더하지 않은 기본 볼 가격 */
import { BASE_BOWL_PRICE } from "./pricing-policy";
export { BASE_BOWL_PRICE } from "./pricing-policy";

export const STAGES: Stage[] = ["GREENS", "PROTEIN", "VEGGIES", "TOPPINGS"];

export const ingredientPhoto = (id: string) => `/images/ingredients/${id}.png`;

/** 카드 한 장에 대한 선택. index 는 재료 순서, liked 는 하트 여부. */
export interface Decision {
  index: number;
  ingredientId?: string;
  liked: boolean;
}

/** "내 조합 저장하기"로 남긴 조합 */
export interface SavedRecipe {
  name: string;
  /** 재료 id 목록 */
  ingredients: string[];
  dressing: number;
  dressingKey?: string;
  price: number;
  savedAt: string;
}

export function bowlPrice(list: Ingredient[]): number {
  return BASE_BOWL_PRICE + list.reduce((n, i) => n + i.price, 0);
}

/** 조합의 "주된 재료": 추가 금액이 가장 비싼 재료 (동점이면 먼저 고른 것) */
export function mainIngredient(list: Ingredient[]): Ingredient {
  return list.reduce((main, i) => (i.price > main.price ? i : main));
}

/** 주된 재료와 가장 비슷한 메뉴 번호 (완성 사진과 "비슷한 메뉴 보기"에 쓴다) */
export function matchProduct(mainIngredientId: string): number {
  if (mainIngredientId === "burrata") return 9;
  if (mainIngredientId === "salmon") return 1;
  if (mainIngredientId === "shrimp") return 2;
  if (mainIngredientId === "tofu") return 3;
  if (mainIngredientId === "chicken") return 0;
  if (mainIngredientId === "chickpea") return 10;
  if (mainIngredientId === "mushroom") return 8;
  return 4;
}

/* ---- 브라우저 저장 ("내 조합 저장하기" 결과만 예전과 같은 localStorage 키를 그대로 쓴다) ---- */

const RECIPE_KEY = "bm-recipe";



function loadRecipe(): SavedRecipe | null {
  const r = read(RECIPE_KEY);
  if (typeof r !== "object" || r === null) return null;
  const { name, ingredients, dressing, price, savedAt } = r as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    !Array.isArray(ingredients) ||
    !ingredients.every((id) => typeof id === "string") ||
    typeof dressing !== "number" ||
(dressing < -1 || !Number.isInteger(dressing))
  )
    return null;
  const key = (r as SavedRecipe).dressingKey;
  if (key !== undefined && (typeof key !== "string" || !key || key.length > 80)) return null;
  return { name: name.slice(0, 30), ingredients, dressing, dressingKey: recipeDressingKey({ dressing, dressingKey: key }), price: Number(price) || 0, savedAt: String(savedAt ?? "") };
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
export const recipeStore = createLocalStore<SavedRecipe | null>(RECIPE_KEY, loadRecipe, (v) => write(RECIPE_KEY, v), null);
