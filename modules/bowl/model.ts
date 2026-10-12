/** 카드 한 장에 대한 선택. index 는 재료 순서, liked 는 하트 여부. */
export interface Decision {
  index: number;
  ingredientId?: string;
  liked: boolean;
}

/** "내 조합 저장하기"로 남긴 조합 */
export interface SavedRecipe {
  id: string;
  name: string;
  /** 재료 id 목록 */
  ingredients: string[];
  dressing: number;
  dressingKey?: string;
  price: number;
  savedAt: string;
  /** 저장한 계정 이메일. 마이페이지에서 계정별로 걸러 보여준다 (서버로 보내지 않는다). */
  ownerEmail?: string;
}
