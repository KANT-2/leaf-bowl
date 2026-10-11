import type { Ingredient, Stage } from "./ingredient";
import { ownValue } from "@/modules/shared/validation";
export const STAGES: Stage[] = ["GREENS", "PROTEIN", "VEGGIES", "TOPPINGS"];
export const ingredientPhoto = (id: string) => `/images/ingredients/${id}.png`;
/** 조합의 "주된 재료": 추가 금액이 가장 비싼 재료 (동점이면 먼저 고른 것) */
export function mainIngredient(list: Ingredient[]): Ingredient {
  return list.reduce((main, i) => (i.price > main.price ? i : main));
}

export function matchProduct(
  ingredientId: string,
  recommendations: Record<string, number>,
): number | undefined {
  return ownValue(recommendations, ingredientId);
}
