import {
  readBrowserJSON as readJSON,
  writeBrowserJSON as writeJSON,
} from "@/infrastructure/browser/json";
/**
 * 로그인·마이페이지 프론트엔드용 mock 사용자 저장소.
 * 실제 인증·DB 연동 전까지 이 브라우저의 localStorage에만 저장한다. 로그아웃해도
 * 프로필·배송지 등은 지우지 않고 loggedIn 플래그만 끈다(실제 서버 계정이 로그아웃 후에도
 * 남아있는 것과 같은 느낌을 내기 위함).
 */
import { createLocalStore } from "@/infrastructure/browser/local-store";

import type { Address, UserProfile } from "@/modules/profile/types";
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
    provider: r.provider === "google" ? r.provider : "email",
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
