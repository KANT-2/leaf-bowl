import type { Catalog, OptionGroup, Product } from "@/lib/admin/catalog";
import { AppError } from "../shared/errors";
import type { OrderItemInput } from "./schema";

import * as policy from "@/lib/pricing-policy";

// API 금액은 정수 BigInt, 화면 정책은 원 단위 number로 표현한다.
export const DELIVERY_FEE = BigInt(policy.DELIVERY_FEE);
export const MIN_DELIVERY_ORDER = BigInt(policy.MIN_DELIVERY_ORDER);
export const FREE_DELIVERY_FROM = BigInt(policy.FREE_DELIVERY_FROM);
export const BASE_BOWL_PRICE = BigInt(policy.BASE_BOWL_PRICE);

export function deliveryFee(subtotal: bigint): bigint {
  return subtotal >= FREE_DELIVERY_FROM ? BigInt(0) : DELIVERY_FEE;
}

interface PricedOption {
  key: string;
  name: string;
  price: number;
}

export interface PricedLine {
  /** 카탈로그 상품 id (salad-0). 내 취향 조합은 null */
  productId: string | null;
  /** 주문 당시 이름 (스냅샷) */
  name: string;
  /** 주문 당시 선택 내역 (스냅샷) */
  options: { dressing?: PricedOption; drinks: PricedOption[]; ingredients: PricedOption[]; custom?: PricedOption[] };
  /** 옵션을 포함한 1개 가격 */
  unitPrice: bigint;
  quantity: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotal: bigint;
  deliveryFee: bigint;
  total: bigint;
}

const sellable = (p: Product) => !p.deleted && p.status === "active";

function findChoice(catalog: Catalog, group: OptionGroup, key: string) {
  if (group.source !== "custom") {
    const type = group.source === "dressings" ? "dressing" : "drink";
    const p = catalog.products.find((x) => x.type === type && x.id === key && !x.deleted && x.status !== "hidden");
    return p && { key: p.id, name: p.name, price: p.price, available: sellable(p) };
  }
  const c = group.choices.find((x) => x.id === key);
  return c && { key: c.id, name: c.name, price: c.price, available: true };
}

function duplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * 화면이 보낸 선택(키)만 믿고 가격은 카탈로그에서 다시 계산한다.
 * 숨김·삭제·품절 상품, 연결되지 않은 옵션, 없는 키는 모두 400.
 */
export function priceOrder(catalog: Catalog, items: OrderItemInput[]): PricedOrder {
  const lines = items.map((item) => priceLine(catalog, item));
  const subtotal = lines.reduce(
    (sum, l) => sum + l.unitPrice * BigInt(l.quantity),
    BigInt(0),
  );
  if (subtotal < MIN_DELIVERY_ORDER) {
    throw new AppError(400, `최소 주문 금액은 ${MIN_DELIVERY_ORDER.toLocaleString("ko-KR")}원입니다.`);
  }
  const fee = deliveryFee(subtotal);
  return { lines, subtotal, deliveryFee: fee, total: subtotal + fee };
}

function priceLine(catalog: Catalog, item: OrderItemInput): PricedLine {
  if (item.productId !== undefined) return priceMenu(catalog, item, item.productId);
  return item.ingredientKeys.length > 0 ? priceCustomBowl(catalog, item) : priceDrinkOnly(catalog, item);
}

function priceMenu(catalog: Catalog, item: OrderItemInput, customerId: number): PricedLine {
  const product = catalog.products.find(
    (p) => p.type === "salad" && p.customerId === customerId && !p.deleted && p.status !== "hidden",
  );
  if (!product) throw new AppError(400, "존재하지 않는 메뉴가 있습니다.");
  if (!sellable(product)) throw new AppError(400, `품절된 메뉴가 있습니다: ${product.name}`);

  const linkedGroups = catalog.groups.filter((g) => !g.deleted && product.optionIds.includes(g.id));

  const dressingGroup = linkedGroups.find((g) => g.id === "dressing" || g.source === "dressings");
  const drinksGroup = linkedGroups.find((g) => g.source === "drinks");
  if (item.optionSelections === undefined) {
    if (item.dressingKey !== undefined && !dressingGroup) throw new AppError(400, "선택할 수 없는 드레싱입니다.");
    if (item.drinkKeys.length && !drinksGroup) throw new AppError(400, "선택할 수 없는 음료입니다.");
  }
  const selections = item.optionSelections ?? Object.fromEntries(linkedGroups.map((group) => [
    group.id,
    group === dressingGroup ? (item.dressingKey === undefined ? [] : [item.dressingKey]) : group === drinksGroup ? item.drinkKeys : [],
  ]));
  if (Object.keys(selections).some((id) => !linkedGroups.some((g) => g.id === id))) {
    throw new AppError(400, "메뉴에 연결되지 않은 옵션입니다.");
  }
  const priced = linkedGroups.map((group) => {
    const keys = selections[group.id] ?? [];
    const label = group === dressingGroup ? "드레싱" : group === drinksGroup ? "음료" : group.name;
    if (group.required && !keys.length) throw new AppError(400, `${label}을 선택해주세요.`);
    if (duplicates(keys)) throw new AppError(400, `같은 ${label}를 중복해서 선택할 수 없습니다.`);
    if (!group.multiple && keys.length > 1) throw new AppError(400, `${label}는 하나만 선택할 수 있습니다.`);
    const choices = keys.map((key): PricedOption => {
      const choice = findChoice(catalog, group, key);
      if (!choice) throw new AppError(400, `선택할 수 없는 ${label}입니다.`);
      if (!choice.available) throw new AppError(400, `품절된 ${label}입니다: ${choice.name}`);
      return { key: choice.key, name: choice.name, price: choice.price };
    });
    return { group, choices };
  });
  const dressingChoices = priced.find((p) => p.group === dressingGroup)?.choices ?? [];
  const drinks = priced.filter((p) => p.group.source === "drinks").flatMap((p) => p.choices);
  const custom = [...dressingChoices.slice(1), ...priced.filter((p) => p.group !== dressingGroup && p.group.source !== "drinks").flatMap((p) => p.choices)];
  const unitPrice = BigInt(product.price) + priced.flatMap((p) => p.choices).reduce((sum, choice) => sum + BigInt(choice.price), BigInt(0));
  return {
    productId: product.id,
    name: product.name,
    options: { dressing: dressingChoices[0], drinks, ingredients: [], ...(custom.length ? { custom } : {}) },
    unitPrice,
    quantity: item.quantity,
  };
}

/** 내 취향 찾기 조합: 기본 볼 + 고른 재료 가격 + 드레싱 (화면의 bowlPrice 와 같은 계산) */
function priceCustomBowl(catalog: Catalog, item: OrderItemInput): PricedLine {
  if (item.drinkKeys.length > 0) throw new AppError(400, "내 취향 볼에는 음료를 함께 담을 수 없습니다.");
  if (duplicates(item.ingredientKeys)) throw new AppError(400, "같은 재료를 중복해서 선택할 수 없습니다.");
  const ingredients = item.ingredientKeys.map((k): PricedOption => {
    const found = (catalog.ingredients ?? []).find((i) => i.id === k && !i.deleted);
    if (!found || found.status === "hidden" || found.price === undefined) {
      throw new AppError(400, "선택할 수 없는 재료입니다.");
    }
    if (found.status !== "active") throw new AppError(400, `품절된 재료가 있습니다: ${found.name}`);
    return { key: found.id, name: found.name, price: found.price };
  });
  let dressing: PricedOption | undefined;
  if (item.dressingKey !== undefined) {
    const p = catalog.products.find((x) => x.type === "dressing" && x.id === item.dressingKey && !x.deleted && x.status !== "hidden");
    if (!p) throw new AppError(400, "선택할 수 없는 드레싱입니다.");
    if (!sellable(p)) throw new AppError(400, `품절된 드레싱입니다: ${p.name}`);
    dressing = { key: p.id, name: p.name, price: p.price };
  }
  const unitPrice =
    BASE_BOWL_PRICE +
    ingredients.reduce((n, i) => n + BigInt(i.price), BigInt(0)) +
    BigInt(dressing?.price ?? 0);
  return {
    productId: null,
    name: "내 취향 볼",
    options: { dressing, drinks: [], ingredients },
    unitPrice,
    quantity: item.quantity,
  };
}

/** 음료 단품 (장바구니의 음료 줄) */
function priceDrinkOnly(catalog: Catalog, item: OrderItemInput): PricedLine {
  const key = item.drinkKeys[0];
  const drink = catalog.products.find((p) => p.type === "drink" && p.id === key && !p.deleted && p.status !== "hidden");
  if (!drink) throw new AppError(400, "선택할 수 없는 음료입니다.");
  if (!sellable(drink)) throw new AppError(400, `품절된 음료가 있습니다: ${drink.name}`);
  return {
    productId: drink.id,
    name: drink.name,
    options: { drinks: [], ingredients: [] },
    unitPrice: BigInt(drink.price),
    quantity: item.quantity,
  };
}
