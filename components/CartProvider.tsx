"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { dressingKey, drinkKey } from "@/lib/cart-identifiers";
import { createLocalStore } from "@/lib/local-store";
import { isCustom, isDrink, itemKey, withChoice } from "@/lib/cart";
import { CART_KEY, loadCart, saveCart, type CartItem, type CustomItem, type MenuItem } from "@/lib/storage";

const EMPTY: CartItem[] = [];
const store = createLocalStore<CartItem[]>(CART_KEY, loadCart, saveCart, EMPTY);

interface CartContextValue {
  items: CartItem[];
  count: number;
  add: (item: MenuItem) => void;
  /** bowl match 에서 만든 커스텀 볼 1개를 담는다. 같은 조합이면 수량만 늘린다. */
  addCustom: (item: Omit<CustomItem, "kind" | "qty">) => void;
  /** 음료 한 잔을 따로 담는다. 이미 있으면 수량만 늘린다. */
  addDrink: (drink: number) => void;
  update: (index: number, qty: number) => void;
  /**
   * 한 줄의 단일 선택 옵션(드레싱 등)을 바꾼다. groupId 가 null 이면 예전 방식(dressing 번호) 줄이다.
   * 같은 구성이 이미 있으면 그 줄과 합치고 true 를 돌려준다.
   */
  changeChoice: (index: number, groupId: string | null, value: string) => boolean;
  /** 같은 샐러드를 다른 선택(드레싱 등)으로 1개 더 담는다. 새 줄(또는 합쳐진 줄)의 위치를 돌려준다. */
  addVariant: (index: number, groupId: string | null, value: string) => number;
  remove: (index: number) => void;
  clear: () => void;
  isOpen: boolean;
  /** 드로어를 연 시각(ms). 날짜·시간대 계산의 기준이며, 한 번도 열지 않았으면 null. */
  openedAt: number | null;
  open: (opener?: HTMLElement | null) => void;
  /** returnFocus=false 이면 열었던 버튼으로 포커스를 돌려주지 않는다 (주문 완료 등). */
  close: (returnFocus?: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

const clampQty = (n: number) => Math.max(1, Math.min(99, n));


export default function CartProvider({ children }: { children: React.ReactNode }) {
  const { DRESSINGS, DRINKS } = useCustomerCatalog();
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [isOpen, setIsOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const add = useCallback((item: MenuItem) => {
    const drinks = [...item.drinks].sort((a, b) => a - b);
    const identified = { ...item, drinks, dressingKey: item.dressingKey ?? DRESSINGS[item.dressing]?.id, drinkKeys: item.drinkKeys ?? drinks.map((n) => DRINKS[n]?.id ?? `missing-drink-${n}`) };
    const list = store.getSnapshot();
    const at = list.findIndex((i) => itemKey(i) === itemKey(identified));
    if (at >= 0) store.set(list.map((i, n) => (n === at ? { ...i, qty: clampQty(i.qty + item.qty) } : i)));
    else store.set([...list, { ...identified, qty: clampQty(item.qty) }]);
  }, [DRESSINGS, DRINKS]);

  const addCustom = useCallback((item: Omit<CustomItem, "kind" | "qty">) => {
    const list = store.getSnapshot();
    const identified = { ...item, dressingKey: item.dressingKey ?? DRESSINGS[item.dressing]?.id };
    const at = list.findIndex((i) => isCustom(i) && i.name === item.name && dressingKey(i) === dressingKey(identified) && i.ingredients.join("|") === item.ingredients.join("|"));
    if (at >= 0) store.set(list.map((i, n) => (n === at ? { ...i, qty: clampQty(i.qty + 1) } : i)));
    else store.set([...list, { kind: "custom", ...identified, ingredients: [...item.ingredients], allergens: [...item.allergens], qty: 1 }]);
  }, [DRESSINGS]);

  const addDrink = useCallback((drink: number) => {
    const list = store.getSnapshot();
    const key = DRINKS[drink]?.id;
    if (!key || !DRINKS[drink].available) return;
    const at = list.findIndex((i) => isDrink(i) && drinkKey(i) === key);
    if (at >= 0) store.set(list.map((i, n) => (n === at ? { ...i, qty: clampQty(i.qty + 1) } : i)));
    else store.set([...list, { kind: "drink", drink, drinkKey: key, qty: 1 }]);
  }, [DRINKS]);

  const changeChoice = useCallback((index: number, groupId: string | null, value: string) => {
    const list = store.getSnapshot();
    const cur = list[index];
    if (!cur || isDrink(cur)) return false;
    const next = withChoice(cur, groupId, value);
    const same = list.findIndex((i, n) => n !== index && itemKey(i) === itemKey(next));
    if (same < 0) {
      store.set(list.map((i, n) => (n === index ? next : i)));
      return false;
    }
    store.set(list.flatMap((i, n) => (n === index ? [] : n === same ? [{ ...i, qty: clampQty(i.qty + cur.qty) }] : [i])));
    return true;
  }, []);

  const addVariant = useCallback((index: number, groupId: string | null, value: string) => {
    const list = store.getSnapshot();
    const cur = list[index];
    if (!cur || isDrink(cur)) return -1;
    const next = { ...withChoice(cur, groupId, value), qty: 1 };
    const same = list.findIndex((i) => itemKey(i) === itemKey(next));
    if (same >= 0) {
      store.set(list.map((i, n) => (n === same ? { ...i, qty: clampQty(i.qty + 1) } : i)));
      return same;
    }
    store.set([...list.slice(0, index + 1), next, ...list.slice(index + 1)]);
    return index + 1;
  }, []);

  const update = useCallback((index: number, qty: number) => {
    store.set(store.getSnapshot().map((i, n) => (n === index ? { ...i, qty: clampQty(qty) } : i)));
  }, []);

  const remove = useCallback((index: number) => {
    store.set(store.getSnapshot().filter((_, n) => n !== index));
  }, []);

  const clear = useCallback(() => store.set([]), []);

  const open = useCallback((from?: HTMLElement | null) => {
    opener.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpenedAt(Date.now());
    setIsOpen(true);
  }, []);

  const close = useCallback((returnFocus = true) => {
    setIsOpen(false);
    const el = opener.current;
    opener.current = null;
    if (returnFocus && el && el.isConnected) el.focus({ preventScroll: true });
  }, []);

  const count = items.reduce((n, i) => n + i.qty, 0);

  const value = useMemo(
    () => ({ items, count, add, addCustom, addDrink, update, changeChoice, addVariant, remove, clear, isOpen, openedAt, open, close }),
    [items, count, add, addCustom, addDrink, update, changeChoice, addVariant, remove, clear, isOpen, openedAt, open, close],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
