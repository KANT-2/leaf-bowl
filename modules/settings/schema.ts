import { z } from "zod";

const money = z.number().int().min(0).max(1_000_000);
export const pricingPolicySchema = z.object({
  deliveryFee: money,
  minDeliveryOrder: money,
  freeDeliveryFrom: money,
  baseBowlPrice: money,
});
export type PricingPolicy = z.infer<typeof pricingPolicySchema>;

export const deliveryHoursSchema = z
  .object({
    days: z.string().min(1).max(80),
    open: z.number().int().min(0).max(23),
    close: z.number().int().min(1).max(24),
  })
  .refine((hours) => hours.open < hours.close, "배달 운영시간을 확인해주세요.");

export const heroSlideSchema = z.object({
  eyebrow: z.string().max(100),
  title: z.tuple([z.string(), z.string()]),
  body: z.tuple([z.string(), z.string()]),
  cta: z.string().max(100),
  href: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)/),
  src: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)/),
  alt: z.string().max(200),
  noteEn: z.string().max(100),
  noteKo: z.string().max(100),
  sticker: z.tuple([z.string(), z.string()]),
  bowl: z.tuple([
    z.number(),
    z.number(),
    z.number().positive(),
    z.number().positive(),
  ]),
});

const optionList = z
  .array(z.string().trim().min(1).max(100))
  .min(1)
  .max(100)
  .refine(
    (values) => new Set(values).size === values.length,
    "설정 항목이 중복되었습니다.",
  );
export const catalogConfigSchema = z.object({
  categoryAliases: z.record(z.enum(["protein", "vegan", "new", "other"])),
  allergenOrder: optionList,
  allergenOptions: optionList,
  ingredientCategories: optionList,
  originCountries: optionList,
  bowlRecommendations: z.record(z.number().int().min(0).max(10000)),
  deliveryRequestPresets: optionList,
});
export type CatalogConfig = z.infer<typeof catalogConfigSchema>;

export const appDefaultsSchema = z.object({
  catalogConfig: catalogConfigSchema,
  heroSlides: z.array(heroSlideSchema).max(20),
  deliveryHours: deliveryHoursSchema,
  pricingPolicy: pricingPolicySchema,
  nutrition: z.record(z.object({ kcal: money, protein: money, weight: money })),
  optionKcal: z.record(money),
  ingredientEmojis: z.record(z.string().max(20)),
  updatedAt: z.string().datetime(),
});
export type AppDefaults = z.infer<typeof appDefaultsSchema>;
