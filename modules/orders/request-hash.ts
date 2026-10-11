import { createHash } from "node:crypto";
import type { CreateOrderInput } from "./schema";

/** 키 순서와 무관하게 같은 내용이면 같은 문자열이 되도록 정렬해서 직렬화한다 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const sorted = (values: string[]) => [...values].sort();

/**
 * 같은 재전송 식별키로 온 요청이 이전과 같은 내용인지 비교하는 해시.
 * 검증을 마친(기본값이 채워진) 입력을 받고, 선택 항목(음료·재료·옵션 그룹별 선택)은 고른 순서가 달라도 같게 본다.
 * 순서가 가격과 선택 집합을 바꾸지 않는다 (pricing.ts 는 선택마다 가격을 더하기만 한다).
 * 주문 항목(items) 자체의 순서는 정렬하지 않는다 — 항목 순서는 주문 내역에 그대로 남는 내용이다.
 */
export function requestHash(input: CreateOrderInput): string {
  const normalized = {
    ...input,
    items: input.items.map((i) => ({
      ...i,
      drinkKeys: sorted(i.drinkKeys),
      ingredientKeys: sorted(i.ingredientKeys),
      ...(i.optionSelections
        ? { optionSelections: Object.fromEntries(Object.entries(i.optionSelections).map(([group, keys]) => [group, sorted(keys)])) }
        : {}),
    })),
  };
  return createHash("sha256").update(canonical(normalized)).digest("hex");
}
