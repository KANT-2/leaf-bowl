declare const time: {
  normalizeUTC(value: unknown): string | null;
  kstDate(ms: number, days?: number): string;
  kstDateTime(ms: number): string;
  legacyKSTUTC(value: unknown): string | null;
  kstSlotStart(day: string, time: string): string | null;
  isAtLeast30MinAhead(day: string, time: string, now?: number): boolean;
  reviewDateTime(review: { date: string; createdAt?: string }): string;
};
export = time;
