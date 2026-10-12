import { dressingKey, dressingKeys, drinkKey, drinkKeys } from "@/modules/cart/identifiers";
import { readBrowserJSON as readJSON, writeBrowserJSON as writeJSON } from "@/infrastructure/browser/json";

export const CART_KEY = "bb-cart";

import type { CartItem, MenuItem, CustomItem, DrinkItem } from "@/modules/cart/types";
import { isRecord, isProductId } from "@/modules/shared/validation";

const isQty = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 99;

const isStringList = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length <= 80);

function isCustomItem(v: unknown): v is CustomItem {
  return (
    isRecord(v) &&
    v.kind === "custom" &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    v.name.length <= 30 &&
    isStringList(v.ingredients, 300) &&
    v.ingredients.length > 0 &&
    isStringList(v.allergens, 30) &&
    (v.dressing === -1 ||
      (typeof v.dressing === "number" && Number.isInteger(v.dressing) && v.dressing >= 0 && v.dressing < 300)) &&
    typeof v.price === "number" &&
    Number.isInteger(v.price) &&
    v.price > 0 &&
    v.price <= 300000000 &&
    isProductId(v.photo) &&
    isQty(v.qty)
  );
}

function isMenuItem(v: unknown): v is MenuItem {
  return (
    isRecord(v) &&
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id >= 0 &&
    (v.dressing === -1 ||
      (typeof v.dressing === "number" && Number.isInteger(v.dressing) && v.dressing >= 0 && v.dressing < 300)) &&
    typeof v.qty === "number" &&
    Number.isInteger(v.qty) &&
    v.qty > 0 &&
    v.qty <= 99 &&
    Array.isArray(v.drinks) &&
    v.drinks.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d < 300)
  );
}

export function loadCart(): CartItem[] {
  const raw = readJSON(CART_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: CartItem[] = [];
  for (const v of raw) {
    if (!isRecord(v)) {
      continue;
    }
    const validKey = (value: unknown) =>
      value === undefined || (typeof value === "string" && value.length > 0 && value.length <= 80);
    if (
      !validKey(v.dressingKey) ||
      !validKey(v.drinkKey) ||
      (v.dressingKeys !== undefined && !isStringList(v.dressingKeys, 5)) ||
      (v.drinkKeys !== undefined && !isStringList(v.drinkKeys, 30))
    ) {
      continue;
    }
    if (isCustomItem(v)) {
      const { name, ingredients, allergens, dressing, price, photo, qty } = v;
      out.push({
        kind: "custom",
        ingredientIds:
          Array.isArray(v.ingredientIds) && v.ingredientIds.every((id) => typeof id === "string" && id.length <= 80)
            ? v.ingredientIds
            : undefined,
        name,
        ingredients: [...ingredients],
        allergens: [...allergens],
        dressing,
        dressingKey: dressingKey(v),
        dressingKeys: dressingKeys(v),
        price,
        photo,
        qty,
      });
    } else if (isRecord(v) && v.kind === "drink" && isProductId(v.drink) && isQty(v.qty)) {
      out.push({
        kind: "drink",
        drink: v.drink,
        drinkKey: drinkKey(v as unknown as DrinkItem),
        qty: v.qty,
      });
    } else if (isMenuItem(v)) {
      const { id, dressing, drinks, qty } = v;
      out.push({
        id,
        dressing,
        dressingKey: dressingKey(v),
        dressingKeys: dressingKeys(v),
        drinks: [...drinks],
        drinkKeys: drinkKeys(v),
        qty,
        optionSelections: isRecord(v.optionSelections)
          ? Object.fromEntries(
              Object.entries(v.optionSelections).filter(
                (entry): entry is [string, string[]] => entry[0].length <= 80 && isStringList(entry[1], 30),
              ),
            )
          : undefined,
        extraPrice:
          typeof v.extraPrice === "number" && Number.isFinite(v.extraPrice) && v.extraPrice >= 0 ? v.extraPrice : 0,
        extraOptions: isStringList(v.extraOptions, 30) ? v.extraOptions : [],
      });
    }
  }
  return out;
}

export function saveCart(items: CartItem[]) {
  writeJSON(CART_KEY, items);
}
