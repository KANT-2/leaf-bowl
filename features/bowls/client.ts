import { z } from "zod";
import { backendRequest } from "@/features/member/client";

const ingredientSchema = z.object({
  ingredient_id: z.string().min(1),
  name: z.string().min(1),
  unit_price: z.number().int().nonnegative().safe(),
});

const recipeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  dressing_key: z.string().min(1),
  dressing_name: z.string().min(1),
  price: z.number().int().nonnegative().safe(),
  saved_at: z.string().datetime({ offset: true }),
  ingredients: z.array(ingredientSchema).min(1),
});

const listSchema = z
  .object({
    items: z.array(recipeSchema).max(20),
    total: z.number().int().min(0).max(20),
  })
  .refine((page) => page.items.length === page.total);

export type BowlRecipe = z.infer<typeof recipeSchema>;

export interface BowlRecipeInput {
  name: string;
  ingredient_ids: string[];
  dressing_key: string;
}

export async function listBowlRecipes(signal?: AbortSignal): Promise<BowlRecipe[]> {
  const parsed = listSchema.safeParse(await backendRequest("/api/v1/bowls", { auth: true, signal }));
  if (!parsed.success) {
    throw new Error("저장한 조합의 응답 형식을 확인하지 못했습니다.");
  }
  return parsed.data.items;
}

export async function saveBowlRecipe(input: BowlRecipeInput, signal?: AbortSignal): Promise<BowlRecipe> {
  // 서버가 회원과 가격을 결정한다. 입력 객체에 다른 값이 있어도 허용한 세 필드만 보낸다.
  const json = { name: input.name.trim(), ingredient_ids: [...input.ingredient_ids], dressing_key: input.dressing_key };
  const parsed = recipeSchema.safeParse(
    await backendRequest("/api/v1/bowls", { method: "POST", auth: true, json, signal }),
  );
  if (!parsed.success) {
    throw new Error("조합 저장 결과를 확인하지 못했습니다. 내 조합 목록을 확인해주세요.");
  }
  return parsed.data;
}

export async function deleteBowlRecipe(id: string, signal?: AbortSignal): Promise<void> {
  await backendRequest(`/api/v1/bowls/${encodeURIComponent(id)}`, { method: "DELETE", auth: true, signal });
}
