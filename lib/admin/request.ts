import type { Snapshot } from "./catalog";
export async function request<T = Snapshot>(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("연결을 확인한 뒤 다시 시도해주세요.");
  }
  const data: T & { error?: string } = await response.json().catch(() => {
    throw new Error(
      response.status === 413
        ? "이미지 용량이 업로드 제한을 초과했습니다. 5MB 이하의 이미지를 선택해주세요."
        : "서버 응답을 확인할 수 없습니다.",
    );
  });
  if (!response.ok)
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}
