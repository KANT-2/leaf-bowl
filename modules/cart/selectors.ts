import type { PublicCatalog } from "@/modules/catalog/public-schema";
import type { Product } from "@/modules/catalog/customer-product";
import { type Ingredient } from "@/modules/bowl/ingredient";
import { type CartItem } from "@/modules/cart/types";
import { hasCustomIngredientIds, isCustom, isDrink } from "@/modules/cart/identity";
import { dressingKeys, drinkKey, drinkKeys } from "@/modules/cart/identifiers";
import { optionChoices } from "@/modules/catalog/options";

const split = (value: string) =>
  value
    .split(/[,·]/)
    .map((s) => s.trim())
    .filter(Boolean);
interface CartOption {
  id: string;
  name: string;
  price: number;
  available: boolean;
  allergens?: string[];
}

export function createCartSelectors(
  catalog: PublicCatalog,
  {
    PRODUCTS,
    DRESSINGS,
    DRINKS,
    ingredients,
    baseBowlPrice,
  }: {
    PRODUCTS: Product[];
    DRESSINGS: CartOption[];
    DRINKS: CartOption[];
    ingredients: Ingredient[];
    baseBowlPrice: number;
  },
) {
  const salads = catalog.products.filter((p) => p.type === "salad");
  const dressingsOf = (item: { dressing: number; dressingKey?: string; dressingKeys?: string[] }) =>
    dressingKeys(item)
      .map((id) => DRESSINGS.find((d) => d.id === id))
      .filter((d): d is CartOption => !!d);

  const drinkOf = (item: { drink: number; drinkKey?: string }) => DRINKS.find((d) => d.id === drinkKey(item));

  const selectedOptions = (i: CartItem) =>
    isCustom(i) || isDrink(i)
      ? []
      : Object.entries(i.optionSelections ?? {}).flatMap(([id, ids]) => {
          const group = catalog.groups.find((g) => g.id === id && !g.deleted);
          if (!group) {
            return [];
          }
          const choices = group.source === "custom" ? group.choices : optionChoices(catalog, group.source);
          return choices.filter((c) => ids.includes(c.id));
        });

  const itemAvailable = (i: CartItem) => {
    if (isDrink(i)) {
      return !!drinkOf(i)?.available;
    }
    if (isCustom(i)) {
      return (
        dressingsOf(i).every((d) => d.available) &&
        hasCustomIngredientIds(i) &&
        i.ingredientIds.every((id) => ingredients.some((x) => x.id === id))
      );
    }
    const p = salads.find((p) => p.customerId === i.id);
    if (!p || p.deleted || p.status !== "active") {
      return false;
    }
    if (i.optionSelections) {
      const groups = catalog.groups.filter((g) => !g.deleted && p.optionIds.includes(g.id));
      return (
        groups.every((g) => {
          const choices = g.source === "custom" ? g.choices : optionChoices(catalog, g.source);
          const selected = i.optionSelections?.[g.id] ?? [];
          return (
            (!g.required || selected.length > 0) &&
            (g.multiple || selected.length <= 1) &&
            new Set(selected).size === selected.length &&
            selected.every((id) => choices.some((c) => c.id === id))
          );
        }) && Object.keys(i.optionSelections).every((id) => groups.some((g) => g.id === id))
      );
    }
    const groups = catalog.groups.filter((g) => !g.deleted && p.optionIds.includes(g.id));
    if (
      groups.some(
        (g) =>
          g.required &&
          (g.source === "custom" ||
            (g.source === "dressings" && !dressingKeys(i).length) ||
            (g.source === "drinks" && !drinkKeys(i).length)),
      )
    ) {
      return false;
    }
    return (
      dressingsOf(i).every((d) => d.available) &&
      dressingKeys(i).every((id) => DRESSINGS.some((d) => d.id === id)) &&
      drinkKeys(i).every((id) => DRINKS.some((d) => d.id === id && d.available))
    );
  };

  const defaultItem = (id: number) => {
    const product = salads.find((p) => p.customerId === id);
    if (!product || product.deleted || product.status !== "active") {
      return null;
    }
    const groups = catalog.groups.filter((g) => !g.deleted && product.optionIds.includes(g.id));
    const optionSelections: Record<string, string[]> = {};
    for (const group of groups) {
      const choices = group.source === "custom" ? group.choices : optionChoices(catalog, group.source);
      if (group.required && !choices.length) {
        return null;
      }
      optionSelections[group.id] = group.required ? [choices[0].id] : [];
    }
    return {
      id,
      dressing: -1,
      drinks: [] as number[],
      qty: 1,
      optionSelections,
    };
  };

  const itemUnitPrice = (i: CartItem) =>
    isDrink(i)
      ? (drinkOf(i)?.price ?? 0)
      : isCustom(i)
        ? (i.ingredientIds
            ? baseBowlPrice +
              ingredients.filter((x) => i.ingredientIds?.includes(x.id)).reduce((n, x) => n + x.price, 0)
            : i.price) + dressingsOf(i).reduce((n, d) => n + d.price, 0)
        : i.optionSelections
          ? (PRODUCTS[i.id]?.price ?? 0) + selectedOptions(i).reduce((n, c) => n + c.price, 0)
          : (PRODUCTS[i.id]?.price ?? 0) +
            drinkKeys(i).reduce((sum, id) => sum + (DRINKS.find((d) => d.id === id)?.price ?? 0), 0) +
            dressingsOf(i).reduce((n, d) => n + d.price, 0) +
            (i.extraPrice ?? 0);

  const itemName = (i: CartItem) =>
    isDrink(i) ? drinkOf(i)?.name || "판매 종료 음료" : isCustom(i) ? i.name : (PRODUCTS[i.id]?.name ?? "삭제된 메뉴");

  const itemOptions = (i: CartItem) =>
    isDrink(i)
      ? "음료"
      : !isCustom(i) && i.optionSelections
        ? selectedOptions(i)
            .map((c) => c.name)
            .join(" · ")
        : [
            ...(isCustom(i)
              ? [
                  "커스텀 볼",
                  ...(i.ingredientIds
                    ? i.ingredientIds.map((id) => ingredients.find((x) => x.id === id)?.name ?? "제공 종료 재료")
                    : i.ingredients),
                ]
              : []),
            ...dressingsOf(i).map((d) => d.name),
            ...(!isCustom(i) ? drinkKeys(i).map((id) => DRINKS.find((d) => d.id === id)?.name) : []),
            ...(!isCustom(i) ? (i.extraOptions ?? []) : []),
          ]
            .filter(Boolean)
            .join(" · ");

  const itemAllergens = (i: CartItem): string[] =>
    isDrink(i)
      ? []
      : isCustom(i)
        ? [...i.allergens, ...dressingsOf(i).flatMap((d) => d.allergens ?? [])]
        : i.optionSelections
          ? [
              ...new Set([
                ...(PRODUCTS[i.id]?.allergens ?? []),
                ...selectedOptions(i).flatMap((c) =>
                  "allergens" in c && typeof c.allergens === "string" ? split(c.allergens) : [],
                ),
              ]),
            ]
          : [...new Set([...(PRODUCTS[i.id]?.allergens ?? []), ...dressingsOf(i).flatMap((d) => d.allergens ?? [])])];
  return {
    itemAvailable,
    defaultItem,
    itemUnitPrice,
    itemName,
    itemOptions,
    itemAllergens,
  };
}
