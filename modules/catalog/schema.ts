import { utcTimestampSchema } from "@/modules/shared/utc-timestamp";
import type { AppDefaults } from "@/modules/settings/schema";
import { z } from "zod";
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const image = z
  .string()
  .max(200)
  .refine(
    (x) =>
      x === "" ||
      /^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|avif)$/.test(x) ||
      /^\/admin-assets\/reviews\/(?:chicken-avocado-review|chicken-avocado-detail|kale-juice-lunch)\.png$/.test(x) ||
      /^\/admin-assets\/ingredients\/(?:romaine|kale|chicken|salmon|shrimp|tofu|chickpea|avocado|tomato|cucumber|mango|corn|mushroom|burrata|quinoa|crouton|nuts|olive)\.png$/.test(
        x,
      ) ||
      /^\/admin-assets\/dressings\/(?:lemon-olive|balsamic|sesame|caesar|none)\.png$/.test(x) ||
      /^\/admin-assets\/drinks\/(?:iced-americano|orange-juice|apple-juice|kale-green-juice)\.png$/.test(x) ||
      /^\/api\/admin\/images\/[a-zA-Z0-9_.-]+$/.test(x) ||
      /^\/admin-assets\/reference\/(?:hero|salad-(?:0[0-9]|1[01]))-cutout\.png$/.test(x),
    "올바른 이미지가 아닙니다.",
  );
export const ingredientSchema = z.object({
  id,
  origin: z.string().trim().max(100).optional(),
  originDetail: z.string().trim().max(300).optional(),
  en: z.string().max(100).optional(),
  price: z.number().int().min(0).max(1000000).optional(),
  stage: z.enum(["GREENS", "PROTEIN", "VEGGIES", "TOPPINGS"]).optional(),
  color: z.string().max(40).optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(600),
  image,
  category: z.string().trim().min(1).max(80),
  allergens: z.string().max(400),
  status: z.enum(["active", "soldout", "hidden"]),
  deleted: z.boolean(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;
export const productSchema = z.object({
  id,
  isNew: z.boolean().optional(),
  customerId: z.number().int().min(0).max(10000).optional(),
  en: z.string().max(100).optional(),
  ingredients: z.string().max(600).optional(),
  type: z.enum(["salad", "drink", "dressing"]),
  name: z.string().trim().min(1).max(80),
  price: z.number().int().min(0).max(1000000),
  description: z.string().max(600),
  category: z.string().min(1).max(80),
  status: z.enum(["active", "soldout", "hidden"]),
  badge: z.enum(["", "BEST", "NEW", "PLANT", "PICK"]),
  image,
  allergens: z.string().max(400),
  optionIds: z
    .array(id)
    .max(30)
    .refine((values) => new Set(values).size === values.length, "메뉴 옵션 ID가 중복되었습니다."),
  deleted: z.boolean(),
});
export const groupSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  required: z.boolean(),
  multiple: z.boolean(),
  source: z.enum(["custom", "drinks", "dressings"]),
  choices: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(80),
        price: z.number().int().min(0).max(1000000),
      }),
    )
    .max(80),
  deleted: z.boolean(),
});
export const seasonPageSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(600),
  image,
  productId: z.string().max(80),
  visible: z.boolean(),
});
export const contentSchema = z.object({
  heroTitle: z.string().trim().min(1).max(200),
  heroDescription: z.string().max(600),
  seasonTitle: z.string().trim().min(1).max(200),
  seasonDescription: z.string().max(600),
  seasonImage: image,
  seasonProductId: z.string().max(80),
  seasonVisible: z.boolean(),
  seasonPages: z.array(seasonPageSchema).max(20).optional(),
});
export const reviewSchema = z.object({
  id,
  sample: z.boolean().optional(),
  productId: z.string().max(80).optional(),
  via: z.enum(["pickup", "delivery"]).optional(),
  title: z.string().max(200),
  body: z.string().min(1).max(10000),
  images: z
    .array(image.refine((value) => value !== "", "이미지를 확인해주세요."))
    .max(10)
    .optional(),
  rating: z.number().int().min(1).max(5),
  menu: z.string().max(120),
  drinks: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  author: z.string().min(1).max(80),
  date: z.string().max(40),
  createdAt: utcTimestampSchema.optional(),
  deleted: z.boolean(),
});
export type Review = z.infer<typeof reviewSchema>;
export const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(300),
  detailAddress: z.string().trim().max(200),
});
export type StoreLocation = z.infer<typeof locationSchema>;
export const catalogSchema = z
  .object({
    location: locationSchema.optional(),
    reviews: z.array(reviewSchema).max(500).optional(),
    ingredients: z.array(ingredientSchema).max(300).optional(),
    products: z.array(productSchema).max(300),
    categories: z.array(z.string().trim().min(1).max(80)).min(1).max(30).optional(),
    groups: z.array(groupSchema).max(50),
    content: contentSchema,
  })
  .superRefine((s, ctx) => {
    if (s.content.seasonPages) {
      if (new Set(s.content.seasonPages.map((p) => p.id)).size !== s.content.seasonPages.length) {
        ctx.addIssue({
          code: "custom",
          message: "시즌 페이지 ID가 중복되었습니다.",
        });
      }
      if (
        s.content.seasonPages.some(
          (page) =>
            page.productId && !s.products.some((p) => p.id === page.productId && p.type === "salad" && !p.deleted),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "시즌 페이지에 연결할 샐러드를 확인해주세요.",
        });
      }
    }
    if (
      s.categories &&
      (new Set(s.categories).size !== s.categories.length ||
        s.products.some((p) => p.type === "salad" && !p.deleted && !s.categories!.includes(p.category)))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "카테고리 중복 또는 메뉴 분류를 확인해주세요.",
      });
    }
    if (s.reviews && new Set(s.reviews.map((r) => r.id)).size !== s.reviews.length) {
      ctx.addIssue({ code: "custom", message: "리뷰 ID가 중복되었습니다." });
    }
    if (s.ingredients && new Set(s.ingredients.map((i) => i.id)).size !== s.ingredients.length) {
      ctx.addIssue({ code: "custom", message: "재료 ID가 중복되었습니다." });
    }
    const check = (values: string[]) => new Set(values).size === values.length;
    if (!check(s.products.map((p) => p.id)) || !check(s.groups.map((g) => g.id))) {
      ctx.addIssue({
        code: "custom",
        message: "메뉴 또는 옵션 ID가 중복되었습니다.",
      });
    }
    const groupIds = new Set(s.groups.filter((g) => !g.deleted).map((g) => g.id));
    if (s.products.some((p) => !p.deleted && p.optionIds.some((x) => !groupIds.has(x)))) {
      ctx.addIssue({
        code: "custom",
        message: "삭제된 옵션을 메뉴에 연결할 수 없습니다.",
      });
    }
    if (s.groups.some((g) => !check(g.choices.map((c) => c.id)))) {
      ctx.addIssue({
        code: "custom",
        message: "선택 항목 ID가 중복되었습니다.",
      });
    }
    if (s.groups.some((g) => !g.deleted && g.source === "custom" && !g.choices.length)) {
      ctx.addIssue({
        code: "custom",
        message: "옵션 그룹에 선택 항목을 하나 이상 등록해주세요.",
      });
    }
    if (
      s.content.seasonProductId &&
      !s.products.some((p) => p.id === s.content.seasonProductId && p.type === "salad" && !p.deleted)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "시즌 스페셜에 연결할 샐러드를 확인해주세요.",
      });
    }
  });
export type Product = z.infer<typeof productSchema>;
export type OptionGroup = z.infer<typeof groupSchema>;
export type Content = z.infer<typeof contentSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogSnapshot = {
  catalog: Catalog;
  revision: number;
  updatedAt: string;
};

/** Application snapshots always include validated DB configuration. */
export type Snapshot = CatalogSnapshot & { defaults: AppDefaults };
