// 상품 규격은 types/product.ts, 상품 데이터는 data/products.ts 에 있다.
// 기존 컴포넌트가 이 파일에서 가져다 쓰므로 그대로 다시 내보낸다.
import type { Product } from "@/types/product";
import { DRESSINGS, DRINKS, PRODUCTS } from "@/data/products";

export type { Category, Dressing, Drink, Product, ProductTag } from "@/types/product";
export { DRESSINGS, DRINKS, PRODUCTS } from "@/data/products";

export interface Nutrition {
  kcal: number;
  /** 단백질 (g) */
  protein: number;
  /** 중량 (g) */
  weight: number;
}

// 체험용 예시 영양 값 (재료 구성으로 추정). 샐러드만 기준이며 드레싱·음료(세트 포함 음료 포함)는 제외. PRODUCTS 와 같은 순서.
export const NUTRITION: Nutrition[] = [
  { kcal: 430, protein: 32, weight: 330 },
  { kcal: 480, protein: 29, weight: 320 },
  { kcal: 290, protein: 22, weight: 310 },
  { kcal: 360, protein: 21, weight: 320 },
  { kcal: 280, protein: 10, weight: 280 },
  { kcal: 450, protein: 34, weight: 320 },
  { kcal: 300, protein: 24, weight: 300 },
  { kcal: 410, protein: 31, weight: 300 },
  { kcal: 340, protein: 11, weight: 310 },
  { kcal: 330, protein: 14, weight: 280 },
  { kcal: 350, protein: 13, weight: 300 },
  { kcal: 470, protein: 31, weight: 340 },
];
// DRESSINGS·DRINKS 와 같은 순서의 1회분 칼로리 (예시 값)
export const DRESSING_KCAL = [120, 60, 140, 150, 0];
export const DRINK_KCAL = [10, 110, 100, 70];

export function kcalOf(id: number, dressing: number, drinks: number[]): number {
  return NUTRITION[id].kcal + DRESSING_KCAL[dressing] + drinks.reduce((n, d) => n + DRINK_KCAL[d], 0);
}

// 상세 페이지에서 옵션에 마우스를 올리면 보여줄 사진 (이름 기준, 없으면 미리보기 없음)
export const OPTION_IMAGES: Record<string, string> = {
  "레몬 올리브": "/images/options/dressing-lemon-olive.png",
  발사믹: "/images/options/dressing-balsamic.png",
  참깨: "/images/options/dressing-sesame.png",
  시저: "/images/options/dressing-caesar.png",
  "드레싱 없이": "/images/options/dressing-none.png",
  "아이스 아메리카노": "/images/options/drink-americano.png",
  "오렌지 주스": "/images/options/drink-orange.png",
  "사과 주스": "/images/options/drink-apple.png",
  "케일 그린 주스": "/images/options/drink-kale.png",
};

export { DELIVERY_FEE, MIN_DELIVERY_ORDER, FREE_DELIVERY_FROM, deliveryFee } from "./pricing-policy";

// 내 취향 찾기(bowl match) 페이지
export const MATCH_URL = "/match";

export function money(v: number): string {
  return v.toLocaleString("ko-KR") + "원";
}

export function getProduct(id: number): Product | undefined {
  return Number.isInteger(id) ? PRODUCTS[id] : undefined;
}

/** URL 세그먼트("0"~"11")를 제품으로 바꾼다. 형식이 다르면 undefined. */
export function productFromParam(param: string): Product | undefined {
  return /^\d+$/.test(param) ? getProduct(Number(param)) : undefined;
}

export function photoSrc(id: number): string {
  return PRODUCTS[id].imageUrl;
}

export function allergensOf(id: number, dressing: number): string[] {
  return [...new Set([...PRODUCTS[id].allergens, ...DRESSINGS[dressing].allergens])];
}

export function unitPrice(id: number, drinks: number[]): number {
  return PRODUCTS[id].price + drinks.reduce((n, d) => n + DRINKS[d].price, 0);
}
