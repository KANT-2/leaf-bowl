// GET /api/products            → 상품 전체 목록
// GET /api/products?category=vegan → 해당 분류만 (protein · vegan · new · other)
import type { NextRequest } from "next/server";
import { CATEGORIES, findProducts, isCategory } from "@/application/products";
import type { ApiError } from "@/types/api";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");

  if (category !== null && !isCategory(category)) {
    const error: ApiError = {
      message: `알 수 없는 분류입니다: ${category} (가능한 값: ${CATEGORIES.join(", ")})`,
    };
    return Response.json(error, { status: 400 });
  }

  return Response.json(await findProducts(category ?? undefined));
}
