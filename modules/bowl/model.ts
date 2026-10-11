/** 카드 한 장에 대한 선택. index 는 재료 순서, liked 는 하트 여부. */
export interface Decision {
  index: number;
  ingredientId?: string;
  liked: boolean;
}

/** "내 조합 저장하기"로 남긴 조합 */
export interface SavedRecipe {
  name: string;
  /** 재료 id 목록 */
  ingredients: string[];
  dressing: number;
  dressingKey?: string;
  price: number;
  savedAt: string;
}
