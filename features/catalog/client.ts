import { z } from "zod";

const menuSchema = z.object({
  id: z.number().int().nonnegative(),
  key: z.string(),
  name: z.string(),
  name_en: z.string().nullable(),
  price: z.number().int().nonnegative(),
  category: z.string(),
  badge: z.string(),
  status: z.enum(["active", "soldout"]),
  image_url: z.string(),
  allergens: z.array(z.string()),
});

const menuPageSchema = z.object({
  items: z.array(menuSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

const errorSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});

export type MenuItem = z.infer<typeof menuSchema>;
export type MenuPage = z.infer<typeof menuPageSchema>;

export interface MenuSearch {
  q?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  exclude_allergens?: string[];
  sort?: "default" | "priceLow" | "priceHigh";
  page?: number;
  size?: number;
}

export async function searchMenus(query: MenuSearch = {}, signal?: AbortSignal): Promise<MenuPage> {
  const params = new URLSearchParams();

  const values = {
    q: query.q?.trim(),
    category: query.category,
    min_price: query.min_price,
    max_price: query.max_price,
    sort: query.sort ?? "default",
    page: query.page ?? 1,
    size: query.size ?? 10,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  for (const allergen of query.exclude_allergens ?? []) {
    params.append("exclude_allergens", allergen);
  }

  const response = await fetch(`/backend/api/v1/menus?${params}`, {
    cache: "no-store",
    signal,
  });

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error("메뉴 서버의 응답을 읽지 못했습니다.");
  }

  if (!response.ok) {
    const error = errorSchema.safeParse(data);
    throw new Error(error.success ? error.data.error.message : "메뉴를 불러오지 못했습니다.");
  }

  const parsed = menuPageSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error("메뉴 응답 형식이 올바르지 않습니다.");
  }

  return parsed.data;
}
