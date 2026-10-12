/** 공통 에러. route.ts 가 잡아서 `{ status, message }` 로 응답한다 (docs/api-design.md §1). */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface ErrorBody {
  status: number;
  message: string;
}

export function errorBody(error: unknown): ErrorBody {
  if (error instanceof AppError) {
    return { status: error.status, message: error.message };
  }
  // 예상하지 못한 오류의 내용은 사용자에게 보여주지 않는다
  return { status: 503, message: "잠시 후 다시 시도해주세요." };
}
