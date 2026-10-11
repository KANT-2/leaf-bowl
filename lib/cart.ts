import { dressingKey, drinkKey, drinkKeys } from "./cart-identifiers";
import type { CartItem, CustomItem, DrinkItem, MenuItem } from "./storage";

export const isCustom = (i: CartItem): i is CustomItem => "kind" in i && i.kind === "custom";
export const isDrink = (i: CartItem): i is DrinkItem => "kind" in i && i.kind === "drink";
export const isMenu = (i: CartItem): i is MenuItem => !("kind" in i);

/** 같은 상품·옵션이면 같은 값 (목록 key, 수량 합치기에 사용) */
export function itemKey(i: CartItem): string {
  if (isDrink(i)) return `d:${drinkKey(i)}`;
  if (!isCustom(i) && i.optionSelections) return `m:${i.id}:${selectionKey(i.optionSelections)}`;
  return isCustom(i) ? `c:${i.name}:${dressingKey(i) ?? ""}:${i.ingredients.join(".")}` : `m:${i.id}:${dressingKey(i) ?? ""}:${[...drinkKeys(i)].sort().join(".")}:${selectionKey(i.optionSelections)}`;
}

export function selectionKey(selections?:Record<string,string[]>):string {
  return JSON.stringify(Object.entries(selections??{}).sort(([a],[b])=>a.localeCompare(b)).map(([group,choices])=>[group,[...choices].sort()]));
}

/** 한 줄의 단일 선택 옵션을 바꾼 새 줄 (음료 줄은 그대로) */
export function withChoice(i: CartItem, groupId: string | null, value: string): CartItem {
  if (isDrink(i)) return i;
  if (groupId === null) return { ...i, dressing: -1, dressingKey: value };
  if (isCustom(i)) return i;
  return { ...i, optionSelections: { ...(i.optionSelections ?? {}), [groupId]: [value] } };
}
