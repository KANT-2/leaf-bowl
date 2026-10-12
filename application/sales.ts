import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { salesDataSchema, type SalesData } from "@/modules/reports/sales";
import type { OrderItemRecord } from "@/modules/orders/types";

type Item = OrderItemRecord & { originalProductId?: string | null };
export function salesItems(items: Item[]): SalesData["orders"][number]["items"] {
  return items.flatMap((item, index) => {
    const productType = item.productType ?? (item.productId ? "salad" : "custom");
    // 예전 주문은 options.dressing(단일)으로 저장되어 있다. 하나짜리 배열로 맞춰 읽는다.
    const legacy = (item.options as { dressing?: { key: string; name: string } }).dressing;
    const dressings = (item.options.dressings ?? (legacy ? [legacy] : [])).filter((d) => d.name !== "드레싱 없이");
    const line = {
      productId: item.originalProductId ?? item.productId ?? `custom-${index}`,
      productType,
      productName: item.name,
      quantity: item.quantity,
      refundedQuantity: 0,
      ...(productType === "salad"
        ? {
            // 드레싱별 조합 통계는 한 줄당 하나의 드레싱만 센다. 여러 개를 담은 주문은 첫 번째로 대표한다.
            dressing: dressings[0] ? { productId: dressings[0].key, productName: dressings[0].name } : null,
          }
        : {}),
    };
    // Drink-only orders already have a drink line; don't count their option snapshot twice.
    const drinks =
      productType === "drink"
        ? []
        : item.options.drinks.map((drink) => ({
            productId: drink.key,
            productType: "drink" as const,
            productName: drink.name,
            quantity: item.quantity,
            refundedQuantity: 0,
          }));
    const dressingLines = dressings.map((dressing) => ({
      productId: dressing.key,
      productType: "dressing" as const,
      productName: dressing.name,
      quantity: item.quantity,
      refundedQuantity: 0,
    }));
    return [line, ...drinks, ...dressingLines];
  });
}

/** Only completed orders are sales; this app does not claim to have payment confirmation. */
export async function readSalesData(db: PrismaClient = prisma()): Promise<SalesData> {
  const rows = await db.order.findMany({
    where: { status: "completed" },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return salesDataSchema.parse({
    updatedAt: new Date().toISOString(),
    orders: rows.map((order) => ({
      id: order.id,
      status: "completed",
      paidAt: null,
      completedAt: order.updatedAt.toISOString(),
      items: salesItems(
        order.items.map((item) => ({
          ...item,
          productType: item.productType as Item["productType"],
          options: item.options as unknown as Item["options"],
        })),
      ),
    })),
  });
}
