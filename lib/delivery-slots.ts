import type { DeliveryHours } from "./data/delivery";

const pad = (n: number) => String(n).padStart(2, "0");

// 배달 날짜·시간은 항상 한국시간(KST) 기준이고 서버도 같은 기준으로 검증하므로, 이 코드를
// 실행하는 브라우저의 시스템 시간대와 무관하게 항상 같은 절대 시각·날짜를 가리켜야 한다.
// "+09:00"을 명시하거나 Asia/Seoul 기준으로 날짜를 읽는 식으로, 이 저장소의 다른 KST
// 처리(lib/admin/catalog.ts의 reviewDateTime 등)와 같은 방식을 쓴다.
function kstDateParts(ms: number): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function dateValue(base: number, day: number): string {
  // KST는 DST가 없어 하루(24h)를 그대로 더해도 항상 KST 기준 다음 날짜가 된다.
  const { year, month, day: d } = kstDateParts(base + day * 86400000);
  return `${year}-${month}-${d}`;
}

export function isAtLeast30MinAhead(day: string, time: string, now = Date.now()): boolean {
  return new Date(`${day}T${time}+09:00`).getTime() > now + 30 * 60000;
}

export function timeOptions(day: string, now: number, { open, close }: DeliveryHours): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = [];
  for (let h = open; h < close; h++) {
    const start = `${pad(h)}:00`;
    if (isAtLeast30MinAhead(day, start, now)) list.push({ value: start, label: `${start}–${pad(h + 1)}:00` });
  }
  return list;
}
