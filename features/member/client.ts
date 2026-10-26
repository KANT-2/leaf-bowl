import { memberTokenStore, type MemberToken } from "@/infrastructure/browser/member-token";
import {
  orderItems,
  orderPageQuery,
  parseOrderPage,
  type OrderInput,
  type ServerOrderPage,
} from "@/features/orders/client";
import { type Address } from "@/modules/profile/types";

/** next.config.ts 의 rewrites 가 FastAPI(backend/)로 넘기는 경로 */
const BACKEND = "/backend";

/** 토큰이 없거나 만료·로그아웃되어 다시 로그인해야 하는 경우 */
export class MemberAuthError extends Error {
  constructor(message = "로그인이 필요합니다. 다시 로그인해주세요.") {
    super(message);
    this.name = "MemberAuthError";
  }
}

interface BackendInit {
  method?: string;
  /** true 면 저장된 토큰을 Authorization 으로 붙인다 */
  auth?: boolean;
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * FastAPI 호출. 오류 응답은 {"error": {"code", "message"}} 모양이다.
 * 인증이 필요한 요청이 401 이면 토큰을 지우고 MemberAuthError 를 던진다.
 */
export async function backendRequest(path: string, init: BackendInit = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.auth) {
    const token = memberTokenStore.current();
    if (!token) {
      throw new MemberAuthError();
    }
    headers.authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    body = new URLSearchParams(init.form);
  }
  let response: Response;
  try {
    response = await fetch(BACKEND + path, {
      method: init.method ?? "GET",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  if (response.status === 204) {
    return null;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("서버 응답을 확인하지 못했습니다. 다시 시도해주세요.");
  }
  if (!response.ok) {
    const message = typeof data?.error?.message === "string" ? data.error.message : undefined;
    if (response.status === 401 && init.auth) {
      memberTokenStore.set(null);
      throw new MemberAuthError("로그인이 만료되었습니다. 다시 로그인해주세요.");
    }
    throw new Error(message ?? "요청을 처리하지 못했습니다. 다시 시도해주세요.");
  }
  return data;
}

export interface Member {
  id: number;
  email: string;
  name: string;
  phone: string | null;
}

function member(data: Awaited<ReturnType<typeof backendRequest>>): Member {
  if (!Number.isSafeInteger(data?.id) || typeof data.email !== "string" || typeof data.name !== "string") {
    throw new Error("회원 정보를 확인하지 못했습니다.");
  }
  return { id: data.id, email: data.email, name: data.name, phone: typeof data.phone === "string" ? data.phone : null };
}

/** 로그인. 성공하면 토큰을 저장하고 회원 정보를 돌려준다. */
export async function loginMember(email: string, password: string, now = Date.now()): Promise<Member> {
  const issued = await backendRequest("/api/auth/token", {
    method: "POST",
    form: { username: email.trim(), password },
  });
  if (typeof issued?.access_token !== "string" || !Number.isFinite(issued.expires_in)) {
    throw new Error("로그인 응답을 확인하지 못했습니다.");
  }
  // 시계 차이를 감안해 서버 만료보다 조금 일찍 만료로 본다
  const token: MemberToken = { token: issued.access_token, expiresAt: now + (issued.expires_in - 30) * 1000 };
  memberTokenStore.set(token);
  try {
    return member(await backendRequest("/api/me", { auth: true }));
  } catch (cause) {
    memberTokenStore.set(null);
    throw cause;
  }
}

export async function signupMember(input: { email: string; password: string; name: string; phone?: string }) {
  return member(
    await backendRequest("/api/auth/signup", {
      method: "POST",
      json: { ...input, phone: input.phone?.trim() || null },
    }),
  );
}

/** 서버에서 토큰을 폐기하고 저장된 토큰을 지운다. 이미 만료된 토큰이어도 화면에서는 로그아웃된다. */
export async function logoutMember() {
  try {
    if (memberTokenStore.current()) {
      await backendRequest("/api/auth/logout", { method: "POST", auth: true });
    }
  } catch {
    /* 서버 폐기에 실패해도 이 탭의 토큰은 지운다 */
  } finally {
    memberTokenStore.set(null);
  }
}

/** 서버에 저장된 내 정보 */
export async function loadMember(): Promise<Member> {
  return member(await backendRequest("/api/me", { auth: true }));
}

/** 이름·전화번호 수정. 보낸 항목만 바뀌고, 전화번호를 빈 문자열로 보내면 지운다. */
export async function updateMember(patch: { name?: string; phone?: string }): Promise<Member> {
  return member(await backendRequest("/api/me", { method: "PATCH", auth: true, json: patch }));
}

/** 서버 배송지(snake_case)를 화면에서 쓰던 Address 모양으로 바꾼다. id 는 문자열로 맞춘다. */
function toAddresses(body: Awaited<ReturnType<typeof backendRequest>>): Address[] {
  if (!Array.isArray(body?.items)) {
    throw new Error("배송지 목록을 확인하지 못했습니다.");
  }
  return body.items.map((a: Record<string, unknown>) => ({
    id: String(a.id),
    label: String(a.label ?? ""),
    recipientName: String(a.recipient_name ?? ""),
    phone: typeof a.phone === "string" ? a.phone : "",
    address: String(a.address ?? ""),
    detail: String(a.detail ?? ""),
    requestNote: String(a.request_note ?? ""),
    isDefault: a.is_default === true,
  }));
}

function addressBody(input: Omit<Address, "id">) {
  return {
    label: input.label,
    recipient_name: input.recipientName,
    phone: input.phone.trim() || null,
    address: input.address,
    detail: input.detail,
    request_note: input.requestNote,
    is_default: input.isDefault,
  };
}

const ADDRESSES = "/api/me/addresses";
const addressPath = (id: string) => `${ADDRESSES}/${encodeURIComponent(id)}`;

/** 내 배송지 (기본 배송지가 맨 앞). 추가·수정·삭제·기본 지정은 바뀐 뒤의 전체 목록을 돌려준다. */
export async function loadAddresses(): Promise<Address[]> {
  return toAddresses(await backendRequest(ADDRESSES, { auth: true }));
}

export async function addAddress(input: Omit<Address, "id">): Promise<Address[]> {
  return toAddresses(await backendRequest(ADDRESSES, { method: "POST", auth: true, json: addressBody(input) }));
}

export async function updateAddress(id: string, input: Omit<Address, "id">): Promise<Address[]> {
  return toAddresses(await backendRequest(addressPath(id), { method: "PATCH", auth: true, json: addressBody(input) }));
}

export async function removeAddress(id: string): Promise<Address[]> {
  return toAddresses(await backendRequest(addressPath(id), { method: "DELETE", auth: true }));
}

export async function setDefaultAddress(id: string): Promise<Address[]> {
  return toAddresses(await backendRequest(`${addressPath(id)}/default`, { method: "POST", auth: true }));
}

export interface LoginHistoryItem {
  id: number;
  result: "success" | "failure";
  reason: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface LoginHistoryPage {
  items: LoginHistoryItem[];
  page: number;
  totalPages: number;
  total: number;
}

export interface LoginHistoryFilter {
  result?: "success" | "failure";
  from?: string;
  to?: string;
  page: number;
  size?: number;
}

/** 내 로그인 이력 (최신순). 날짜는 YYYY-MM-DD, 한국 시간 기준이다. */
export async function loadLoginHistory(filter: LoginHistoryFilter): Promise<LoginHistoryPage> {
  const params = new URLSearchParams({ page: String(filter.page), size: String(filter.size ?? 10) });
  for (const key of ["result", "from", "to"] as const) {
    if (filter[key]) {
      params.set(key, filter[key]);
    }
  }
  const body = await backendRequest(`/api/me/login-history?${params}`, { auth: true });
  if (!Array.isArray(body?.items) || !Number.isSafeInteger(body.total)) {
    throw new Error("로그인 기록을 확인하지 못했습니다.");
  }
  return {
    items: body.items.map((i: Record<string, unknown>) => ({
      id: Number(i.id),
      result: i.result === "success" ? "success" : "failure",
      reason: typeof i.reason === "string" ? i.reason : null,
      userAgent: typeof i.user_agent === "string" ? i.user_agent : null,
      createdAt: String(i.created_at),
    })),
    page: Number(body.page),
    totalPages: Number(body.total_pages),
    total: body.total,
  };
}

/** 회원 주문 접수 (결제 없이). 같은 key 로 다시 보내면 기존 주문이 돌아온다. */
export async function submitMemberOrder(input: OrderInput, key: string): Promise<{ id: string; total: number }> {
  const body = await backendRequest("/api/v1/orders", {
    method: "POST",
    auth: true,
    headers: { "idempotency-key": key },
    json: { ...input, items: orderItems(input.items) },
  });
  if (typeof body?.id !== "string" || !/^\d+$/.test(body.total) || !Number.isSafeInteger(Number(body.total))) {
    throw new Error("주문 접수 결과를 확인하지 못했습니다. 같은 주문으로 다시 시도해주세요.");
  }
  return { id: body.id, total: Number(body.total) };
}

export async function loadMemberOrders(cursor?: string): Promise<ServerOrderPage> {
  return parseOrderPage(await backendRequest("/api/v1/orders?" + orderPageQuery(cursor), { auth: true }));
}

export async function cancelMemberOrder(id: string, reason?: string): Promise<{ status: string; canceledAt: string }> {
  const body = await backendRequest(`/api/v1/orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    auth: true,
    json: reason ? { reason } : {},
  });
  if (typeof body?.status !== "string" || typeof body.canceledAt !== "string") {
    throw new Error("취소 결과를 확인하지 못했습니다. 주문 내역을 새로 고쳐주세요.");
  }
  return { status: body.status, canceledAt: body.canceledAt };
}

/** 회원 주문만 취소할 수 있는 상태 (FastAPI·DB 트리거와 같은 규칙) */
export function isCancelable(status: string) {
  return status === "received" || status === "confirmed";
}
