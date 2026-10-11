import { z } from "zod";
import { catalogSchema, productSchema } from "@/lib/admin/catalog";
import { appDefaultsSchema } from "@/lib/data/defaults";
import { utcTimestampSchema } from "@/lib/utc-timestamp";

// 숨겨진 상품도 기존 장바구니의 슬롯을 유지하되, 고객에게 내용은 공개하지 않는다.
const visibleProductSchema = productSchema.refine(p => !p.deleted && p.status !== "hidden");
const withheldProductSchema = productSchema.extend({
  name: z.literal(""), en: z.literal(""), description: z.literal(""),
  ingredients: z.literal(""), image: z.literal(""), allergens: z.literal(""),
  price: z.literal(0), badge: z.literal(""), optionIds: z.array(z.string()).length(0),
}).refine(p => p.deleted || p.status === "hidden");

export const publicCatalogSchema = catalogSchema.innerType().extend({
  products: z.array(z.union([visibleProductSchema, withheldProductSchema])).max(300),
}).superRefine((catalog, ctx) => {
  for (const rows of [catalog.products, catalog.groups, catalog.ingredients ?? [], catalog.reviews ?? []]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length)
      ctx.addIssue({ code: "custom", message: "공개 카탈로그 ID가 중복되었습니다." });
  }
  if (catalog.groups.some(g => g.deleted) || catalog.ingredients?.some(i => i.deleted || i.status !== "active") || catalog.reviews?.some(r => r.deleted))
    ctx.addIssue({ code: "custom", message: "공개 카탈로그의 판매 상태를 확인해주세요." });
});

export const publicSnapshotSchema = z.object({
  catalog: publicCatalogSchema,
  revision: z.number().int().positive(),
  updatedAt: utcTimestampSchema,
  defaults: appDefaultsSchema.optional(),
});
export type PublicCatalog = z.infer<typeof publicCatalogSchema>;
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;
