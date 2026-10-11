/** bowl match 재료 카드 하나 */
export interface Ingredient {
  id: string;
  image?: string;
  name: string;
  en: string;
  desc: string;
  emoji: string;
  stage: Stage;
  /** 카드 오른쪽 위 분류 이름 */
  group: string;
  /** 기본 볼에 더해지는 가격 (0 이면 기본 볼에 포함) */
  price: number;
  allergens: string[];
  /** 카드 사진 배경색 */
  color: string;
}

export type Stage = "GREENS" | "PROTEIN" | "VEGGIES" | "TOPPINGS";
