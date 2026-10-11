// 관리자 상품 수정 요청(JSON)을 검사한다. 통과하면 수정할 항목만 담아 돌려준다.
import type { ProductTag, ProductUpdate } from "@/modules/catalog/customer-product";

const TAGS: readonly ProductTag[] = ["BEST", "PLANT", "PICK", "NEW"];
const MAX_PRICE = 1_000_000;

type Result = { ok: true; value: ProductUpdate } | { ok: false; message: string };

export function parseProductUpdate(body: unknown): Result {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "요청 본문은 JSON 객체여야 합니다" };
  }

  const input = body as Record<string, unknown>;
  const allowed = ["name", "description", "price", "tag", "isNew", "isOnSale"];
  const unknownKeys = Object.keys(input).filter((k) => !allowed.includes(k));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      message: `수정할 수 없는 항목입니다: ${unknownKeys.join(", ")}`,
    };
  }
  if (Object.keys(input).length === 0) {
    return {
      ok: false,
      message: `수정할 항목을 하나 이상 보내 주세요 (${allowed.join(", ")})`,
    };
  }

  const value: ProductUpdate = {};

  if ("name" in input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name.length < 1 || name.length > 50) {
      return { ok: false, message: "name 은 1~50자 문자열이어야 합니다" };
    }
    value.name = name;
  }
  if ("description" in input) {
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length < 1 || description.length > 200) {
      return {
        ok: false,
        message: "description 은 1~200자 문자열이어야 합니다",
      };
    }
    value.description = description;
  }
  if ("price" in input) {
    const price = input.price;
    if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      return {
        ok: false,
        message: `price 는 0~${MAX_PRICE.toLocaleString("ko-KR")} 사이의 정수(원)여야 합니다`,
      };
    }
    value.price = price;
  }
  if ("tag" in input) {
    // null 을 보내면 뱃지를 없앤다
    if (input.tag === null) {
      value.tag = undefined;
    } else if (typeof input.tag === "string" && (TAGS as readonly string[]).includes(input.tag)) {
      value.tag = input.tag as ProductTag;
    } else {
      return {
        ok: false,
        message: `tag 는 ${TAGS.join(", ")} 또는 null 이어야 합니다`,
      };
    }
  }
  for (const key of ["isNew", "isOnSale"] as const) {
    if (key in input) {
      const flag = input[key];
      if (typeof flag !== "boolean") {
        return { ok: false, message: `${key} 는 true 또는 false 여야 합니다` };
      }
      value[key] = flag;
    }
  }

  return { ok: true, value };
}
