"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { createLocalStore } from "@/infrastructure/browser/local-store";
import {
  addCartItem,
  changeCartChoice,
  addCartVariant,
  toggleCartDressing,
  updateCartQuantity,
} from "@/modules/cart/operations";
import { CART_KEY, loadCart, saveCart } from "@/infrastructure/browser/cart-storage";
import { type CartItem, type CustomItem, type MenuItem } from "@/modules/cart/types";

const EMPTY: CartItem[] = [];
const store = createLocalStore<CartItem[]>(CART_KEY, loadCart, saveCart, EMPTY);

interface CartContextValue {
  items: CartItem[];
  count: number;
  add: (item: MenuItem) => void;
  /** bowl match 에서 만든 커스텀 볼 1개를 담는다. 같은 조합이면 수량만 늘린다. */
  addCustom: (item: Omit<CustomItem, "kind" | "qty">) => void;
  /** 음료를 담는다. 이미 있으면 수량만 늘린다. */
  addDrink: (drink: number, quantity?: number) => void;
  update: (index: number, qty: number) => void;
  /**
   * 한 줄의 단일 선택 옵션(드레싱 등)을 바꾼다. groupId 가 null 이면 예전 방식(dressing 번호) 줄이다.
   * 같은 구성이 이미 있으면 그 줄과 합치고 true 를 돌려준다.
   */
  changeChoice: (index: number, groupId: string | null, value: string) => boolean;
  /** 같은 샐러드를 다른 선택(드레싱 등)으로 1개 더 담는다. 새 줄(또는 합쳐진 줄)의 위치를 돌려준다. */
  addVariant: (index: number, groupId: string | null, value: string) => number;
  /** 한 줄에 담긴 드레싱을 켜고 끈다 (여러 개 동시에 담을 수 있다). 같은 구성이 이미 있으면 합친다. */
  toggleDressing: (index: number, groupId: string | null, value: string) => boolean;
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
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return ctx;
}

export default function CartProvider({ children }: { children: React.ReactNode }) {
  const { DRESSINGS, DRINKS } = useCustomerCatalog();
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [isOpen, setIsOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const add = useCallback(
    (item: MenuItem) => {
      const drinks = [...item.drinks].sort((a, b) => a - b);
      const identified = {
        ...item,
        drinks,
        dressingKey: item.dressingKey ?? DRESSINGS[item.dressing]?.id,
        drinkKeys: item.drinkKeys ?? drinks.map((n) => DRINKS[n]?.id ?? `missing-drink-${n}`),
      };
      store.set(addCartItem(store.getSnapshot(), identified));
    },
    [DRESSINGS, DRINKS],
  );

  const addCustom = useCallback(
    (item: Omit<CustomItem, "kind" | "qty">) => {
      const identified: CustomItem = {
        ...item,
        kind: "custom",
        qty: 1,
        dressingKey: item.dressingKey ?? DRESSINGS[item.dressing]?.id,
      };
      store.set(addCartItem(store.getSnapshot(), identified));
    },
    [DRESSINGS],
  );

  const addDrink = useCallback(
    (drink: number, quantity = 1) => {
      const selected = DRINKS[drink];
      if (!selected?.available || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return;
      }
      store.set(
        addCartItem(store.getSnapshot(), {
          kind: "drink",
          drink,
          drinkKey: selected.id,
          qty: quantity,
        }),
      );
    },
    [DRINKS],
  );

  const changeChoice = useCallback((index: number, groupId: string | null, value: string) => {
    const result = changeCartChoice(store.getSnapshot(), index, groupId, value);
    store.set(result.items);
    return result.merged;
  }, []);

  const addVariant = useCallback((index: number, groupId: string | null, value: string) => {
    const result = addCartVariant(store.getSnapshot(), index, groupId, value);
    store.set(result.items);
    return result.index;
  }, []);

  const toggleDressing = useCallback((index: number, groupId: string | null, value: string) => {
    const result = toggleCartDressing(store.getSnapshot(), index, groupId, value);
    store.set(result.items);
    return result.merged;
  }, []);

  const update = useCallback((index: number, qty: number) => {
    store.set(updateCartQuantity(store.getSnapshot(), index, qty));
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
    if (returnFocus && el && el.isConnected) {
      el.focus({ preventScroll: true });
    }
  }, []);

  const count = items.reduce((n, i) => n + i.qty, 0);

  const value = useMemo(
    () => ({
      items,
      count,
      add,
      addCustom,
      addDrink,
      update,
      changeChoice,
      addVariant,
      toggleDressing,
      remove,
      clear,
      isOpen,
      openedAt,
      open,
      close,
    }),
    [
      items,
      count,
      add,
      addCustom,
      addDrink,
      update,
      changeChoice,
      addVariant,
      toggleDressing,
      remove,
      clear,
      isOpen,
      openedAt,
      open,
      close,
    ],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
