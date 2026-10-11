/** 배송 예약은 UTC ISO 문자열로 전달·저장하고 KST로만 표시한다. */
import { kstDate } from "@/modules/shared/time";
export { kstDate } from "@/modules/shared/time";
const HOUR = 3_600_000;
const KST_OFFSET = 9 * HOUR;
const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export interface DeliveryWindow {
  desiredStartAt: string;
  desiredEndAt: string;
}

export function utcISOString(value: string): string | null {
  if (!utcPattern.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const canonical = value.length === 20 ? value.replace("Z", ".000Z") : value;
  return date.toISOString() === canonical ? canonical : null;
}

/** KST 달력 날짜와 정시 한 시간 슬롯을 UTC로 바꾼다. 23:00–24:00도 지원한다. */
export function deliveryWindowUTC(
  day: string,
  timeLabel: string,
): DeliveryWindow | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const match = /^(\d{2}):00–(\d{2}):00$/.exec(timeLabel);
  if (!match) return null;
  const startHour = Number(match[1]);
  const endHour = Number(match[2]);
  if (startHour > 23 || endHour !== startHour + 1) return null;
  const start = new Date(`${day}T${match[1]}:00:00+09:00`);
  if (!Number.isFinite(start.getTime()) || kstDate(start.getTime()) !== day)
    return null;
  return {
    desiredStartAt: start.toISOString(),
    desiredEndAt: new Date(start.getTime() + HOUR).toISOString(),
  };
}

/** UTC 배송 슬롯을 KST 날짜·표시 시간대로 변환하며 정시 한 시간 범위를 검증한다. */
export function deliveryWindowKST(
  start: string,
  end: string,
): { day: string; timeLabel: string } | null {
  const startISO = utcISOString(start);
  const endISO = utcISOString(end);
  if (!startISO || !endISO) return null;
  const startMs = Date.parse(startISO);
  const endMs = Date.parse(endISO);
  if (startMs % HOUR !== 0 || endMs - startMs !== HOUR) return null;
  const startHour = new Date(startMs + KST_OFFSET).getUTCHours();
  const pad = (hour: number) => String(hour).padStart(2, "0");
  return {
    day: kstDate(startMs),
    timeLabel: `${pad(startHour)}:00–${pad(startHour + 1)}:00`,
  };
}
