export type AuthProvider = "email" | "google";

export interface Address {
  id: string;
  /** "집", "회사" 같은 배송지 별칭 */
  label: string;
  /** 받는 사람 이름 */
  recipientName: string;
  /** 배송지 전용 연락처 */
  phone: string;
  /** 도로명 주소 (실제 서비스라면 주소 검색 API로 채운다) */
  address: string;
  detail: string;
  /** 배송 요청사항 (프리셋 또는 직접 입력) */
  requestNote: string;
  isDefault: boolean;
}

export interface UserProfile {
  loggedIn: boolean;
  provider: AuthProvider;
  name: string;
  email: string;
  phone: string;
  addresses: Address[];
  /** 선호 메뉴 분류 (catalog.categories 값) */
  preferredCategories: string[];
  /** 제외하고 싶은 알레르기 재료 */
  excludedAllergens: string[];
}
