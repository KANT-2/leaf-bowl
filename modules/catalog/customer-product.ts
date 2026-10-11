// 상품 데이터의 규격. 화면(컴포넌트)·API 응답·DB 테이블이 모두 이 모양을 따른다.

export type Category = "protein" | "vegan" | "new" | "other";
export type ProductTag = "BEST" | "PLANT" | "PICK" | "NEW";

export interface Product {
  // ── 과제 필수 규격 ──
  /** 상품 고유 번호. 현재 PRODUCTS 배열 위치와 같다 (0부터) */
  id: number;
  status?: "active" | "soldout" | "hidden";
  categoryLabel?: string;
  name: string;
  /** 원 단위 정수 */
  price: number;
  category: Category;
  imageUrl: string;
  description: string;
  isNew?: boolean;

  // ── 샐러드 매장 추가 항목 ──
  /** 영문 이름 (카드 보조 표기) */
  en: string;
  /** 카드 뱃지 */
  tag?: ProductTag;
  /** 알레르기 유발 재료 */
  allergens: string[];
  /** 주요 재료, " · " 로 구분 */
  ingredients: string;
  /** 판매 중 여부. 관리자가 판매 중지하면 false (없으면 판매 중) */
  isOnSale?: boolean;
}

/** 관리자가 수정할 수 있는 항목. 보낸 항목만 바뀐다 */
export type ProductUpdate = Partial<Pick<Product, "name" | "description" | "price" | "tag" | "isNew" | "isOnSale">>;

export interface Dressing {
  name: string;
  allergens: string[];
}

export interface Drink {
  name: string;
  /** 추가 금액 (원) */
  price: number;
}
