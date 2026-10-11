import type { PricingPolicy } from "@/modules/settings/schema";
export function deliveryFee(subtotal: number, policy: PricingPolicy): number {
  return subtotal >= policy.freeDeliveryFrom ? 0 : policy.deliveryFee;
}
