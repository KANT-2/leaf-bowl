import { type CartItem } from "@/modules/cart/types";
import { hasCustomIngredientIds, isCustom } from "@/modules/cart/identity";
import type { CustomerCatalog } from "@/modules/catalog/customer-view";
import { type DeliveryHours } from "@/modules/delivery/hours";
import { kstSlotStart } from "@/modules/shared/time";
import { dateValue, timeOptions } from "@/modules/delivery/slots";

/** 결제 화면 진입 후 바뀐 판매 상태·금액·예약 시간을 주문 확정 직전에 확인한다. */
export function checkoutIssue(
  items: CartItem[],
  catalog: Pick<
    CustomerCatalog,
    "itemAvailable" | "itemUnitPrice" | "pricingPolicy"
  >,
  delivery: {
    address: string;
    day: string;
    timeLabel: string;
    hours: DeliveryHours;
  },
  now = Date.now(),
): string {
  if (!items.length) return "담은 메뉴가 없어요.";
  if (items.some((i) => isCustom(i) && !hasCustomIngredientIds(i)))
    return "저장한 조합의 재료를 다시 선택해주세요.";
  if (items.some((i) => !catalog.itemAvailable(i)))
    return "품절되거나 삭제된 메뉴·옵션이 있어요. 장바구니를 확인해주세요.";
  const subtotal = items.reduce(
    (sum, item) => sum + catalog.itemUnitPrice(item) * item.qty,
    0,
  );
  const minimum = catalog.pricingPolicy.minDeliveryOrder;
  if (subtotal < minimum)
    return `최소 주문 금액은 ${minimum.toLocaleString("ko-KR")}원이에요.`;
  if (!delivery.address.trim()) return "배송지를 입력해주세요.";
  const { day, timeLabel, hours } = delivery;
  const date = kstSlotStart(day, "12:00");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    date === null ||
    day < dateValue(now, 0) ||
    day > dateValue(now, 14)
  ) {
    return "받을 날짜를 다시 선택해주세요.";
  }
  if (!timeOptions(day, now, hours).some((slot) => slot.label === timeLabel))
    return "받을 시간대를 다시 선택해주세요.";
  return "";
}
