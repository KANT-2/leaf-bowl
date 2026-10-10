"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

/** 최상단 공지 바. 오른쪽에 로그인/마이페이지 링크를 둔다 (실제 쇼핑몰의 상단 유틸리티 바와 같은 자리). */
export default function AnnouncementBar() {
  const { isLoggedIn } = useAuth();
  return (
    <div className="announcement">
      <div className="announcement-inner wrap">
        <span className="announcement-text">FRESH EVERY DAY · 오늘의 신선함을, 당신의 한 끼로</span>
        <Link href={isLoggedIn ? "/mypage" : "/login"} className="announcement-account">
          {isLoggedIn ? "마이페이지" : "로그인"}
        </Link>
      </div>
    </div>
  );
}
