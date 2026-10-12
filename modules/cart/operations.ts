import { isDrink, itemKey, withChoice } from "./identity";
import type { CartItem } from "./types";

export function clampQuantity(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(99, Math.trunc(value))) : 1;
}

/** Inputs are snapshots; callers cannot mutate a newly inserted line through their draft. */
export function addCartItem(items: CartItem[], item: CartItem): CartItem[] {
  const same = items.findIndex((current) => itemKey(current) === itemKey(item));
  if (same < 0) {
    return [...items, { ...structuredClone(item), qty: clampQuantity(item.qty) }];
  }
  return items.map((current, index) =>
    index === same ? { ...current, qty: clampQuantity(current.qty + item.qty) } : current,
  );
}

export function changeCartChoice(items: CartItem[], index: number, groupId: string | null, value: string) {
  const current = items[index];
  if (!current || isDrink(current)) {
    return { items, merged: false };
  }
  const next = withChoice(current, groupId, value);
  const same = items.findIndex((item, at) => at !== index && itemKey(item) === itemKey(next));
  if (same < 0) {
    return {
      items: items.map((item, at) => (at === index ? next : item)),
      merged: false,
    };
  }
  return {
    items: items.flatMap((item, at) =>
      at === index ? [] : at === same ? [{ ...item, qty: clampQuantity(item.qty + current.qty) }] : [item],
    ),
    merged: true,
  };
}

export function addCartVariant(items: CartItem[], index: number, groupId: string | null, value: string) {
  const current = items[index];
  if (!current || isDrink(current)) {
    return { items, index: -1 };
  }
  const next = { ...withChoice(current, groupId, value), qty: 1 };
  const same = items.findIndex((item) => itemKey(item) === itemKey(next));
  if (same >= 0) {
    return { items: addCartItem(items, next), index: same };
  }
  return {
    items: [...items.slice(0, index + 1), next, ...items.slice(index + 1)],
    index: index + 1,
  };
}

export function updateCartQuantity(items: CartItem[], index: number, quantity: number): CartItem[] {
  if (!Number.isFinite(quantity)) {
    return items;
  }
  return items.map((item, at) => (at === index ? { ...item, qty: clampQuantity(quantity) } : item));
}
