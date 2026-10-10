import type { DeliveryHours } from "@/lib/data/delivery";
import { AppError } from "../shared/errors";

/**
 * 받을 날짜·시간대 검증. 규칙은 화면(lib/checkout-validation.ts, lib/delivery-slots.ts)과 같다:
 * 오늘부터 14일 이내, 운영시간 안의 한 시간 단위, 지금부터 30분 이후에 시작하는 시간대만 허용한다.
 * 화면 코드는 실행 환경의 시간대를 쓰므로, 서버에서는 한국 시간(UTC+9)으로 직접 계산한다.
 */
const KST_OFFSET_MS = 9 * 3600_000;
const MAX_DAYS_AHEAD = 14;
const MIN_LEAD_MS = 30 * 60_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** 한국 시간 기준 날짜 문자열 (YYYY-MM-DD). days 만큼 더한다 */
export function seoulDate(now: Date, days = 0): string {
  return new Date(now.getTime() + KST_OFFSET_MS + days * 24 * 3600_000).toISOString().slice(0, 10);
}

/** 한국 시간 `day` 의 `hour` 시 정각이 UTC 로 몇 시인지 */
function seoulInstant(day: string, hour: number): number {
  return Date.parse(`${day}T${pad(hour)}:00:00+09:00`);
}

/** 화면과 같은 표시: "10:00–11:00" (가운데는 en dash) */
export function slotLabels(day: string, hours: DeliveryHours, now: Date): string[] {
  const labels: string[] = [];
  for (let h = hours.open; h < hours.close; h++) {
    if (seoulInstant(day, h) > now.getTime() + MIN_LEAD_MS) labels.push(`${pad(h)}:00–${pad(h + 1)}:00`);
  }
  return labels;
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
