import { type Ingredient } from "@/modules/catalog/schema";

const splitTokens = (text: string) =>
  text
    .split(/[·,，、;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);

export function matchesIngredient(token: string, ingredient: Ingredient) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");
  return (
    !ingredient.deleted &&
    [ingredient.name, ingredient.name.trim().split(/\s+/).at(-1) ?? ""].some(
      (name) => normalize(name) === normalize(token),
    )
  );
}

// Use registered ingredient data only; unknown ingredients need administrator review.
export function ingredientAllergens(text: string, ingredients: Ingredient[]) {
  const tokens = splitTokens(text);
  const allergens = new Set<string>();
  const unknown: string[] = [];
  for (const token of tokens) {
    const matches = ingredients.filter((i) => matchesIngredient(token, i));
    if (!matches.length) {
      unknown.push(token);
    }
    for (const ingredient of matches) {
      ingredient.allergens
        .split(/[,·，、;\n]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => allergens.add(value));
    }
  }
  return {
    allergens: [...allergens].join(", "),
    unknown: [...new Set(unknown)],
  };
}

export interface IngredientOrigin {
  name: string;
  /** 등록된 재료를 찾지 못했으면 빈 문자열 (관리자 확인 필요) */
  origin: string;
  allergens: string;
}

/** 상품의 재료 표시용 문자열을 등록된 재료의 원산지·알레르기 정보로 바꾼다. */
export function ingredientOrigins(text: string, ingredients: Ingredient[]): IngredientOrigin[] {
  return splitTokens(text).map((token) => {
    const match = ingredients.find((i) => matchesIngredient(token, i));
    return {
      name: token,
      origin: match?.origin ?? "",
      allergens:
        match?.allergens
          .split(/[,·，、;\n]+/)
          .map((value) => value.trim())
          .filter(Boolean)
          .join(", ") ?? "",
    };
  });
}
