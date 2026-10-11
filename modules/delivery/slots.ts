import { type DeliveryHours } from "@/modules/delivery/hours";
import { kstDate, isAtLeast30MinAhead } from "@/modules/shared/time";
export { isAtLeast30MinAhead } from "@/modules/shared/time";
const pad = (n: number) => String(n).padStart(2, "0");

export function dateValue(base: number, day: number): string {
  return kstDate(base, day);
}

export function timeOptions(
  day: string,
  now: number,
  { open, close }: DeliveryHours,
): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = [];
  for (let h = open; h < close; h++) {
    const start = `${pad(h)}:00`;
    if (isAtLeast30MinAhead(day, start, now))
      list.push({ value: start, label: `${start}–${pad(h + 1)}:00` });
  }
  return list;
}
