import { type Ingredient } from "@/modules/catalog/schema";

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
  const tokens = text
    .split(/[·,，、;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
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
