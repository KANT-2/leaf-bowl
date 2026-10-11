import { z } from "zod";
import { ORDER_STATUSES } from "./status";

const key = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);

/** 달력에 있는 날짜인지 (2026-02-30 같은 값은 거부) */
function isCalendarDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** 가격은 받지 않는다. 서버가 카탈로그에서 다시 계산한다. */
export const orderItemSchema = z
  .object({
    /** 메뉴의 고객 주소 번호 (/product/0 의 0). 내 취향 조합·음료 단품이면 없다 */
    productId: z.number().int().min(0).max(10000).optional(),
    dressingKey: key.optional(),
    /** 관리자 정의 옵션도 그룹·선택의 고정 ID로 전달한다. 기존 필드와 함께 보내지 않는다. */
    optionSelections: z.record(key, z.array(key).max(30)).refine((v) => Object.keys(v).length <= 30).optional(),
    drinkKeys: z.array(key).max(10).default([]),
    /** 내 취향 찾기로 고른 재료 */
    ingredientKeys: z.array(key).max(20).default([]),
    quantity: z.number().int().min(1).max(99),
  })
  .strict()
  .refine(
    (v) => {
      const menu = v.productId !== undefined;
      const custom = v.ingredientKeys.length > 0;
      const drinkOnly = !menu && !custom && v.drinkKeys.length === 1 && v.dressingKey === undefined;
      if (v.optionSelections !== undefined && (!menu || v.dressingKey !== undefined || v.drinkKeys.length > 0)) return false;
      return (menu && !custom) || (custom && !menu) || drinkOnly;
    },
    { message: "메뉴, 재료 조합, 음료 단품 중 하나만 선택해주세요." },
  );

export const createOrderSchema = z
  .object({
    items: z.array(orderItemSchema).min(1).max(30),
    ordererName: z.string().trim().min(1).max(50),
    phone: z.string().trim().regex(/^01[016789]-?\d{3,4}-?\d{4}$/, "연락처를 확인해주세요."),
    address: z.string().trim().min(1).max(300),
    addressDetail: z.string().trim().max(200).default(""),
    desiredDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isCalendarDate, "받을 날짜를 확인해주세요."),
    desiredSlot: z.string().trim().min(1).max(30),
  })
  .strict();

/** 재전송 식별키 (Idempotency-Key 헤더) */
export const idempotencyKeySchema = z.string().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/);

export const cancelOrderSchema = z
  .object({ reason: z.string().trim().max(200).optional() })
  .strict();

export const changeStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    version: z.number().int().min(1),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, "조회 기간을 확인해주세요.");

export const adminOrderListQuerySchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    /** 접수일 범위 (한국 시간 기준 날짜, 양 끝 포함) */
    from: day.optional(),
    to: day.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(300).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "조회 기간을 확인해주세요." });

/** 고객 본인의 주문 목록 */
export const ownOrderListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(300).optional(),
});

export const orderIdSchema = z.string().uuid();

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
export type OwnOrderListQuery = z.infer<typeof ownOrderListQuerySchema>;
