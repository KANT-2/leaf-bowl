"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MATCH_URL } from "@/lib/products";

const REVIEWS_PATH = /^\/(reviews|product\/\d+\/reviews)\/?$/;

export default function HeaderNav() {
  const path = usePathname();
  const onReviews = REVIEWS_PATH.test(path);
  return (
    <nav aria-label="주요 메뉴">
      <Link href="/menu" aria-current={path === "/menu" ? "page" : undefined}>
        메뉴
      </Link>
      <Link href="/drinks" aria-current={path === "/drinks" ? "page" : undefined}>
        음료
      </Link>
      <Link href="/#monthly">시즌 스페셜</Link>
      <Link href="/reviews" aria-current={onReviews ? "page" : undefined}>
        고객 리뷰
      </Link>
      <Link href={MATCH_URL} className="match-link" aria-current={path === MATCH_URL ? "page" : undefined}>
        내 취향 찾기
      </Link>
    </nav>
  );
}
