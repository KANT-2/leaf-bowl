import { kstDate, kstSlotStart } from "@/lib/time";
import { timeOptions } from "@/lib/delivery-slots";
import type { DeliveryHours } from "@/lib/data/delivery";
import { AppError } from "../shared/errors";

/**
 * 받을 날짜·시간대 검증. 규칙은 화면(lib/checkout-validation.ts, lib/delivery-slots.ts)과 같다:
 * 오늘부터 14일 이내, 운영시간 안의 한 시간 단위, 지금부터 30분 이후에 시작하는 시간대만 허용한다.
 * 서버·화면 모두 공통 KST 달력·슬롯 계산을 사용하며 저장 시각은 UTC다.
 */
const MAX_DAYS_AHEAD = 14;

/** 한국 시간 기준 날짜 문자열 (YYYY-MM-DD). days 만큼 더한다 */
export function seoulDate(now: Date, days = 0): string {
  return kstDate(now.getTime(), days);
}

/** 한국 시간 하루의 시작(UTC 시각). 목록의 기간 조회에서 쓴다 */
export function seoulDayStart(day: string): Date {
  const instant = kstSlotStart(day, "00:00");
  if (!instant) throw new AppError(400, "조회 기간을 확인해주세요.");
  return new Date(instant);
}

/** 화면과 같은 운영 시간·30분 이후 슬롯을 사용한다. */
export function slotLabels(day: string, hours: DeliveryHours, now: Date): string[] {
  return timeOptions(day, now.getTime(), hours).map(slot => slot.label);
}

export function assertDeliverySlot(
  slot: { desiredDate: string; desiredSlot: string },
  hours: DeliveryHours,
  now: Date,
): void {
  const { desiredDate, desiredSlot } = slot;
  if (desiredDate < seoulDate(now, 0) || desiredDate > seoulDate(now, MAX_DAYS_AHEAD)) {
    throw new AppError(400, "받을 날짜를 다시 선택해주세요.");
  }
  if (!slotLabels(desiredDate, hours, now).includes(desiredSlot)) {
    throw new AppError(400, "받을 시간대를 다시 선택해주세요.");
  }
}
