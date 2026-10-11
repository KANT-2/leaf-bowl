import { utcTimestampSchema } from "@/modules/shared/utc-timestamp";
import { kstDate, kstSlotStart } from "@/modules/shared/time";
import { z } from "zod";
import { type Catalog } from "@/modules/catalog/schema";

export const salesProductTypes = ["salad", "drink", "dressing"] as const;
export type SalesProductType = (typeof salesProductTypes)[number];

export const salesPeriods = ["all", "today", "7d", "30d"] as const;
export type SalesPeriod = (typeof salesPeriods)[number];
export const salesDataSchema = z
  .object({
    updatedAt: utcTimestampSchema,
    orders: z.array(
      z
        .object({
          id: z.string().min(1),
          status: z.enum([
            "pending",
            "paid",
            "completed",
            "cancelled",
            "refunded",
          ]),
          paidAt: utcTimestampSchema.nullable(),
          completedAt: utcTimestampSchema.nullable().optional(),
          items: z.array(
            z
              .object({
                productId: z.string().min(1),
                productType: z.enum(["salad", "drink", "dressing", "custom"]),
                productName: z.string().min(1),
                // Undefined is legacy/unrecorded; null is an explicit no-dressing choice.
                dressing: z
                  .object({
                    productId: z.string().min(1),
                    productName: z.string().min(1),
                  })
                  .nullable()
                  .optional(),
                quantity: z.number().int().positive().max(1000000),
                refundedQuantity: z.number().int().nonnegative().default(0),
              })
              .refine(
                (item) => item.refundedQuantity <= item.quantity,
                "환불 수량은 판매 수량을 초과할 수 없습니다.",
              ),
          ),
        })
        .refine(
          (order) =>
            order.status === "completed"
              ? !!(order.completedAt ?? order.paidAt)
              : !["paid", "refunded"].includes(order.status) ||
                order.paidAt !== null,
          "확정 주문에는 결제 또는 완료 시각이 필요합니다.",
        ),
    ),
  })
  .refine(
    (data) =>
      new Set(data.orders.map((order) => order.id)).size === data.orders.length,
    "주문 번호가 중복되었습니다.",
  );
export type SalesData = z.infer<typeof salesDataSchema>;
export type SalesRow = {
  productId: string;
  name: string;
  image: string;
  quantity: number;
  rank: number | null;
  share: number;
  archived: boolean;
};
export type DressingCombination = {
  saladId: string;
  saladName: string;
  dressingId: string | null;
  dressingName: string;
  selection: "selected" | "none" | "unknown";
  quantity: number;
  saladQuantity: number;
  share: number;
};
export type SalesReport = {
  productType: SalesProductType;
  period: SalesPeriod;
  connected: boolean;
  updatedAt: string | null;
  totalQuantity: number;
  orderCount: number;
  rows: SalesRow[];
  combinations: DressingCombination[];
};

// Periods use Korean calendar days, including today, and never include future sales.
export function salesPeriodStart(period: SalesPeriod, now: Date): number {
  if (period === "all") return -Infinity;
  const koreanDay = kstDate(now.getTime());
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 1;
  return Date.parse(kstSlotStart(koreanDay, "00:00")!) - (days - 1) * 86400000;
}

export function buildSalesReport(
  catalog: Catalog,
  data: SalesData | null,
  period: SalesPeriod,
  now = new Date(),
  productType: SalesProductType = "salad",
): SalesReport {
  const products = new Map(
    catalog.products
      .filter((p) => p.type === productType)
      .map((p) => [p.id, p]),
  );
  const quantities = new Map<string, { name: string; quantity: number }>();
  for (const product of products.values()) {
    if (!product.deleted)
      quantities.set(product.id, { name: product.name, quantity: 0 });
  }
  const combinationCounts = new Map<
    string,
    Omit<DressingCombination, "saladQuantity" | "share">
  >();
  const dressings = new Map(
    catalog.products.filter((p) => p.type === "dressing").map((p) => [p.id, p]),
  );
  let orderCount = 0;
  const start = salesPeriodStart(period, now);
  for (const order of data?.orders ?? []) {
    const soldAt = order.completedAt ?? order.paidAt;
    if (!["paid", "completed"].includes(order.status) || !soldAt) continue;
    const paidAt = Date.parse(soldAt);
    if (paidAt < start || paidAt > now.getTime()) continue;
    let counted = false;
    for (const item of order.items) {
      const quantity = item.quantity - item.refundedQuantity;
      if (item.productType !== productType || quantity <= 0) continue;
      const existing = quantities.get(item.productId);
      quantities.set(item.productId, {
        name:
          existing?.name ??
          products.get(item.productId)?.name ??
          item.productName,
        quantity: (existing?.quantity ?? 0) + quantity,
      });
      if (productType === "salad") {
        const selection =
          item.dressing === undefined
            ? "unknown"
            : item.dressing === null
              ? "none"
              : "selected";
        const dressingId = item.dressing?.productId ?? null;
        const key = JSON.stringify([item.productId, selection, dressingId]);
        const previous = combinationCounts.get(key);
        combinationCounts.set(key, {
          saladId: item.productId,
          saladName: products.get(item.productId)?.name ?? item.productName,
          dressingId,
          dressingName: item.dressing
            ? (dressings.get(item.dressing.productId)?.name ??
              item.dressing.productName)
            : selection === "none"
              ? "드레싱 없이"
              : "선택 정보 없음",
          selection,
          quantity: (previous?.quantity ?? 0) + quantity,
        });
      }
      counted = true;
    }
    if (counted) orderCount++;
  }
  const sorted = [...quantities].sort(
    (a, b) => b[1].quantity - a[1].quantity || a[0].localeCompare(b[0]),
  );
  const totalQuantity = sorted.reduce(
    (sum, [, item]) => sum + item.quantity,
    0,
  );
  let rank = 0;
  let previousQuantity = -1;
  const rows = sorted.map(([productId, item], index): SalesRow => {
    if (item.quantity !== previousQuantity) rank = index + 1;
    previousQuantity = item.quantity;
    const product = products.get(productId);
    return {
      productId,
      name: item.name,
      image: product?.image ?? "",
      quantity: item.quantity,
      rank: item.quantity > 0 ? rank : null,
      share: totalQuantity ? (item.quantity / totalQuantity) * 100 : 0,
      archived: !product || product.deleted,
    };
  });
  const combinations = [...combinationCounts.values()]
    .map((item) => {
      const saladQuantity = quantities.get(item.saladId)?.quantity ?? 0;
      return {
        ...item,
        saladQuantity,
        share: saladQuantity ? (item.quantity / saladQuantity) * 100 : 0,
      };
    })
    .sort(
      (a, b) =>
        a.saladId.localeCompare(b.saladId) ||
        b.quantity - a.quantity ||
        a.dressingName.localeCompare(b.dressingName),
    );
  return {
    productType,
    period,
    connected: data !== null,
    updatedAt: data?.updatedAt ?? null,
    totalQuantity,
    orderCount,
    rows,
    combinations,
  };
}
