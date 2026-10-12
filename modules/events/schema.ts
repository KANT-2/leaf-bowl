import { z } from "zod";
import { productSchema } from "@/modules/catalog/schema";
import { kstDate } from "@/modules/shared/time";

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "올바른 날짜를 입력해주세요.");
export const eventSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    startDate: day,
    endDate: day,
    image: productSchema.shape.image,
    mobileImage: productSchema.shape.image,
    alt: z.string().trim().max(300),
    href: z
      .string()
      .trim()
      .max(300)
      .refine((value) => value === "" || /^\/(?!\/)[^\s\\]*$/.test(value), "사이트 내부 경로를 입력해주세요."),
    visible: z.boolean(),
  })
  .strict()
  .refine((event) => event.startDate <= event.endDate, "종료일은 시작일 이후로 설정해주세요.");
export const eventsSchema = z
  .array(eventSchema)
  .max(100)
  .refine((events) => new Set(events.map((event) => event.id)).size === events.length, "이벤트 ID가 중복되었습니다.");
export const eventUpdateSchema = z.object({ events: eventsSchema, revision: z.number().int().positive() }).strict();
export type ManagedEvent = z.infer<typeof eventSchema>;
export interface EventSnapshot {
  events: ManagedEvent[];
  revision: number;
}
export type EventStatus = "scheduled" | "ongoing" | "ended";
export const eventStatusLabel: Record<EventStatus, string> = { scheduled: "예정", ongoing: "진행 중", ended: "종료" };
export function eventStatus(event: Pick<ManagedEvent, "startDate" | "endDate">, now = Date.now()): EventStatus {
  const today = kstDate(now);
  return today < event.startDate ? "scheduled" : today > event.endDate ? "ended" : "ongoing";
}
