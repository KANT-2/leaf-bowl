import { normalizeUTC } from "@/modules/shared/time";
import { AppError } from "./errors";

/** 관리자 주문 목록의 "마지막으로 본 주문" 표시. (status, createdAt, id) 인덱스 순서와 같다. */
export interface OrderCursor {
  createdAt: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: OrderCursor): string {
  const createdAt = normalizeUTC(cursor.createdAt);
  if (!createdAt) throw new AppError(400, "cursor 값이 올바르지 않습니다.");
  return Buffer.from(JSON.stringify({ c: createdAt, i: cursor.id })).toString(
    "base64url",
  );
}

export function decodeCursor(raw: string): OrderCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const createdAt = normalizeUTC(parsed?.c);
    if (
      createdAt !== null &&
      typeof parsed?.i === "string" &&
      UUID.test(parsed.i)
    ) {
      return { createdAt, id: parsed.i };
    }
  } catch {
    // 아래에서 같은 오류로 처리한다
  }
  throw new AppError(400, "cursor 값이 올바르지 않습니다.");
}
