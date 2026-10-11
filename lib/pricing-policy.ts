import type { PricingPolicy } from "./data/defaults";
/** 이전 데이터·메모리 테스트용 기준. 실제 서버와 화면의 값은 SQL 설정을 사용한다. */
export const DELIVERY_FEE = 3000;
export const MIN_DELIVERY_ORDER = 15000;
export const FREE_DELIVERY_FROM = 30000;
export const BASE_BOWL_PRICE = 6500;

export const REFERENCE_PRICING_POLICY: PricingPolicy = {
  deliveryFee: DELIVERY_FEE, minDeliveryOrder: MIN_DELIVERY_ORDER,
  freeDeliveryFrom: FREE_DELIVERY_FROM, baseBowlPrice: BASE_BOWL_PRICE,
};
export function deliveryFee(subtotal: number, policy = REFERENCE_PRICING_POLICY): number {
  return subtotal >= policy.freeDeliveryFrom ? 0 : policy.deliveryFee;
}
