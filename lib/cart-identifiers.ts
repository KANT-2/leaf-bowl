/** 기존 브라우저 값은 초기 카탈로그의 ID로 고정한다. 현재 배열 순서로 재해석하지 않는다. */
export const legacyDressingKey = (index: number): string | undefined => index < 0 ? undefined : `dressing-${index}`;
export const legacyDrinkKey = (index: number): string => `drink-${index}`;

export function dressingKey(item: { dressing: number; dressingKey?: string }): string | undefined {
  return item.dressingKey ?? legacyDressingKey(item.dressing);
}
export function drinkKey(item: { drink: number; drinkKey?: string }): string {
  return item.drinkKey ?? legacyDrinkKey(item.drink);
}
export function drinkKeys(item: { drinks: number[]; drinkKeys?: string[] }): string[] {
  return item.drinkKeys ?? item.drinks.map(legacyDrinkKey);
}
