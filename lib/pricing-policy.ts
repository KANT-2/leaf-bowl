/** 체험 화면과 주문 서버가 함께 사용하는 원 단위 정책. */
export const DELIVERY_FEE = 3000;
export const MIN_DELIVERY_ORDER = 15000;
export const FREE_DELIVERY_FROM = 30000;
export const BASE_BOWL_PRICE = 6500;

export function deliveryFee(subtotal: number): number {
  return subtotal >= FREE_DELIVERY_FROM ? 0 : DELIVERY_FEE;
}
