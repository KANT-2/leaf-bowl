import { readBrowserJSON as readJSON, writeBrowserJSON as writeJSON } from "./browser-json";
/**
 * 로그인·마이페이지 프론트엔드용 mock 사용자 저장소.
 * 실제 인증·DB 연동 전까지 이 브라우저의 localStorage에만 저장한다. 로그아웃해도
 * 프로필·배송지 등은 지우지 않고 loggedIn 플래그만 끈다(실제 서버 계정이 로그아웃 후에도
 * 남아있는 것과 같은 느낌을 내기 위함).
 */
import { createLocalStore } from "./local-store";

export type AuthProvider = "email" | "google";

export interface Address {
  id: string;
  /** "집", "회사" 같은 배송지 별칭 */
  label: string;
  /** 받는 사람 이름 */
  recipientName: string;
  /** 배송지 전용 연락처 */
  phone: string;
  /** 도로명 주소 (실제 서비스라면 주소 검색 API로 채운다) */
  address: string;
  detail: string;
  /** 배송 요청사항 (프리셋 또는 직접 입력) */
  requestNote: string;
  isDefault: boolean;
}

/** 배송 요청사항 선택지 */
export const DELIVERY_REQUEST_PRESETS = [
  "문 앞에 놔주세요",
  "경비실에 맡겨주세요",
  "배송 전 연락해주세요",
  "직접 받을게요",
];

export interface UserProfile {
  loggedIn: boolean;
  provider: AuthProvider;
  name: string;
  email: string;
  phone: string;
  addresses: Address[];
  /** 선호 메뉴 분류 (catalog.categories 값) */
  preferredCategories: string[];
  /** 제외하고 싶은 알레르기 재료 */
  excludedAllergens: string[];
}

const USER_KEY = "bb-user";



const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function isAddress(v: unknown): v is Address {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Address).id === "string" &&
    typeof (v as Address).label === "string" &&
    typeof (v as Address).address === "string" &&
    typeof (v as Address).detail === "string" &&
    typeof (v as Address).isDefault === "boolean" &&
    typeof (v as Address).recipientName === "string" &&
    typeof (v as Address).phone === "string" &&
    typeof (v as Address).requestNote === "string"
  );
}

function loadUser(): UserProfile | null {
  const raw = readJSON(USER_KEY);
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.email !== "string") return null;
  return {
    loggedIn: r.loggedIn === true,
    provider:
      r.provider === "google" ? r.provider : "email",
    name: r.name,
    email: r.email,
    phone: typeof r.phone === "string" ? r.phone : "",
    addresses: Array.isArray(r.addresses) ? r.addresses.filter(isAddress) : [],
    preferredCategories: isStringList(r.preferredCategories)
      ? r.preferredCategories
      : [],
    excludedAllergens: isStringList(r.excludedAllergens)
      ? r.excludedAllergens
      : [],
  };
}

function saveUser(user: UserProfile | null) {
  writeJSON(USER_KEY, user);
}

export const userStore = createLocalStore<UserProfile | null>(
  USER_KEY,
  loadUser,
  saveUser,
  null,
);
