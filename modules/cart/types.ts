/** 메뉴에서 고른 상품 */
export interface MenuItem {
  optionSelections?: Record<string, string[]>;
  extraPrice?: number;
  extraOptions?: string[];
  id: number;
  dressing: number;
  dressingKey?: string;
  dressingKeys?: string[];
  drinks: number[];
  drinkKeys?: string[];
  qty: number;
}

/** bowl match(/match) 에서 재료를 골라 만든 커스텀 볼 */
export interface CustomItem {
  ingredientIds?: string[];
  kind: "custom";
  name: string;
  /** 재료 이름 */
  ingredients: string[];
  /** 재료 알레르기 (드레싱 알레르기는 dressing 으로 따로 계산) */
  allergens: string[];
  dressing: number;
  dressingKey?: string;
  dressingKeys?: string[];
  /** 1개 가격 (기본 볼 + 재료) */
  price: number;
  /** 참고 사진으로 쓸 PRODUCTS 번호 */
  photo: number;
  qty: number;
}

/** 장바구니에서 따로 담은 음료 한 종류 */
export interface DrinkItem {
  kind: "drink";
  /** 카탈로그 DRINKS 번호 */
  drink: number;
  drinkKey?: string;
  qty: number;
}

export type CartItem = MenuItem | CustomItem | DrinkItem;
