// GET /api/products/0  → 상품 1개
// 숫자가 아니거나 없는 번호면 404
import type { NextRequest } from "next/server";
import { findProductById } from "@/application/products";
import type { ApiError } from "@/types/api";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/products/[id]">) {
  const { id } = await ctx.params;
  const product = /^\d+$/.test(id) ? await findProductById(Number(id)) : undefined;

  if (!product) {
    const error: ApiError = { message: "상품을 찾을 수 없습니다" };
    return Response.json(error, { status: 404 });
  }

  return Response.json(product);
}
