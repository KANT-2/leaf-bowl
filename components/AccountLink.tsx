"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function AccountLink() {
  const path = usePathname();
  const { isLoggedIn } = useAuth();
  const href = isLoggedIn ? "/mypage" : "/login";
  const label = isLoggedIn ? "마이페이지" : "로그인";
  return (
    <Link
      href={href}
      className="account-link"
      aria-current={path === "/mypage" || path === "/login" ? "page" : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
      </svg>
      <span className="account-text">{label}</span>
    </Link>
  );
}
