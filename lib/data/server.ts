import "server-only";
import { prisma, type DatabaseTransaction } from "@/lib/prisma";
import { appDefaultsSchema, deliveryHoursSchema, pricingPolicySchema } from "./defaults";

export async function readAppDefaults(database: Pick<DatabaseTransaction, "appSetting"> = prisma()) {
  const rows = await database.appSetting.findMany();
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  if (["hero_slides", "delivery_hours", "pricing_policy", "nutrition", "option_kcal", "ingredient_emojis"].some(key => values[key] === undefined)) throw new Error("기본 앱 설정이 없습니다. db:seed를 실행해주세요.");
  return appDefaultsSchema.parse({
    heroSlides: values.hero_slides, deliveryHours: values.delivery_hours,
    pricingPolicy: values.pricing_policy, nutrition: values.nutrition,
    optionKcal: values.option_kcal, ingredientEmojis: values.ingredient_emojis,
    updatedAt: new Date(Math.max(...rows.map(row => row.updatedAt.getTime()))).toISOString(),
  });
}

export async function getDeliveryHours() {
  const row = await prisma().appSetting.findUniqueOrThrow({ where: { key: "delivery_hours" } });
  return deliveryHoursSchema.parse(row.value);
}

export async function getHeroSlides() { return (await readAppDefaults()).heroSlides; }

/** Keep a policy update from racing the transaction that confirms a price. */
export async function readPricingPolicy(tx: DatabaseTransaction) {
  const rows = await tx.$queryRaw<{ value: unknown }[]>`SELECT value FROM app_settings WHERE key = 'pricing_policy' FOR SHARE`;
  return pricingPolicySchema.parse(rows[0]?.value);
}
