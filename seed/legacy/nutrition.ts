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
