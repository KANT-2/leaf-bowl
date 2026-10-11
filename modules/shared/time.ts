/** Instants are UTC; customer and administrator calendars are KST. */
const DAY = 86400000;
const OFFSET = 9 * 3600000;

export function normalizeUTC(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const wall = new Date(match[1] + "Z");
  const instant = new Date(value);
  // Date.parse rolls impossible calendar days into the next month: reject them.
  if (
    !Number.isFinite(wall.getTime()) ||
    wall.toISOString().slice(0, 19) !== match[1] ||
    !Number.isFinite(instant.getTime())
  ) {
    return null;
  }
  return instant.toISOString();
}

export function kstDate(ms: number, days = 0): string {
  return new Date(ms + OFFSET + days * DAY).toISOString().slice(0, 10);
}

export function kstDateTime(ms: number): string {
  const iso = new Date(ms + OFFSET).toISOString();
  return iso.slice(0, 10).replaceAll("-", ".") + " " + iso.slice(11, 16);
}

/** Legacy wall-clock strings have a KST calendar, never the machine's local zone. */
export function legacyKSTUTC(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})[.-](\d{2})[.-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?$/.exec(value);
  if (!match) {
    return null;
  }
  return normalizeUTC(
    `${match[1]}-${match[2]}-${match[3]}T${match[4] ?? "12"}:${match[5] ?? "00"}:${match[6] ?? "00"}${match[7] ?? ""}+09:00`,
  );
}

export function kstSlotStart(day: string, time: string): string | null {
  return normalizeUTC(`${day}T${time}:00+09:00`);
}

export function isAtLeast30MinAhead(day: string, time: string, now = Date.now()): boolean {
  const start = kstSlotStart(day, time);
  return start !== null && Date.parse(start) > now + 30 * 60000;
}

export function reviewDateTime(review: { date: string; createdAt?: string }): string {
  const instant = normalizeUTC(review.createdAt);
  return instant ? kstDateTime(Date.parse(instant)) : review.date;
}
