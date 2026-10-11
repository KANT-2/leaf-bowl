import type { NextRequest } from "next/server";
import { parseProductUpdate } from "@/modules/catalog/product-validation";
import { updateProduct } from "@/application/products";
import { services } from "@/application/container";
import { requireAdmin } from "@/modules/identity/guard";
import { AppError, errorBody } from "@/modules/shared/errors";
import { sameOrigin, readLimited, BodyTooLarge } from "@/infrastructure/http/request";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/products/[id]">) {
  if (!sameOrigin(request)) {
    return Response.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  try {
    await requireAdmin(request, services().identity);
    const { id } = await ctx.params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new AppError(404, "상품을 찾을 수 없습니다");
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(await readLimited(request, 16_384)));
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        throw error;
      }
      throw new AppError(400, "요청 본문이 올바른 JSON이 아닙니다");
    }
    const parsed = parseProductUpdate(body);
    if (!parsed.ok) {
      throw new AppError(400, parsed.message);
    }
    const result = await updateProduct(Number(id), parsed.value);
    if (!result) {
      throw new AppError(404, "상품을 찾을 수 없습니다");
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = errorBody(error instanceof BodyTooLarge ? new AppError(413, "요청 본문이 너무 큽니다.") : error);
    return Response.json(
      { message: failure.message },
      { status: failure.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
