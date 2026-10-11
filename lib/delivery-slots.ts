import type { DeliveryHours } from "./data/delivery";

const pad = (n: number) => String(n).padStart(2, "0");
export function dateValue(base: number, day: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + day);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isAtLeast30MinAhead(day: string, time: string, now = Date.now()): boolean {
  return new Date(`${day}T${time}`).getTime() > now + 30 * 60000;
}

export function timeOptions(day: string, now: number, { open, close }: DeliveryHours): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = [];
  for (let h = open; h < close; h++) {
    const start = `${pad(h)}:00`;
    if (isAtLeast30MinAhead(day, start, now)) list.push({ value: start, label: `${start}–${pad(h + 1)}:00` });
  }
  return list;
}
