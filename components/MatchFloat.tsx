"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCart } from "./CartProvider";
import { MATCH_URL } from "@/features/customer/routes";

const KEY = "bb-match-collapsed";

// 리뷰 카드 등 본문과 겹치는 중간 폭(701~1300px)에서는 따로 고른 적이 없으면 접힌 탭으로 시작한다.
const NARROW = "(min-width: 701px) and (max-width: 1300px)";

// sessionStorage 를 쓸 수 없을 때를 위한 메모리 값 (이번 페이지에서만 유지)
let memory: boolean | null = null;
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v === "1") {
      return true;
    }
    if (v === "0") {
      return false;
    }
  } catch {
    // 읽기 실패 시 메모리 값으로 동작한다.
  }
  return memory ?? window.matchMedia(NARROW).matches;
}

function writeCollapsed(v: boolean) {
  memory = v;
  try {
    sessionStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // 저장소를 쓸 수 없으면 이번 화면에서만 유지한다.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", l);
  return () => {
    listeners.delete(l);
    mq.removeEventListener("change", l);
  };
};

/**
 * 홈 화면 오른쪽에 붙는 "내 취향 찾기" 플로팅 배너.
 * 서버 렌더·하이드레이션 중에는 아무것도 그리지 않고, 마운트 후 sessionStorage 를 읽어
 * 펼침/접힘 상태로 나타나므로 하이드레이션 불일치나 깜빡임이 없다.
 */
export default function MatchFloat() {
  // 서버 렌더·하이드레이션 중에는 null(저장소를 읽지 않음, 아무것도 그리지 않음), 마운트 후에만 sessionStorage 값.
  const collapsed = useSyncExternalStore<boolean | null>(subscribe, readCollapsed, () => null);
  const [footerVisible, setFooterVisible] = useState(false);
  const { isOpen: cartOpen } = useCart();
  const tabRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLAnchorElement>(null);
  const moveFocus = useRef<"tab" | "start" | null>(null);

  const mounted = collapsed !== null;

  // 푸터가 화면에 보이면 배너를 숨긴다.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const footer = document.querySelector("footer");
    if (!footer || !("IntersectionObserver" in window)) {
      return;
    }
    const io = new IntersectionObserver((en) => setFooterVisible(en[0].isIntersecting));
    io.observe(footer);
    return () => io.disconnect();
  }, [mounted]);

  // 접기/펼치기 직후 포커스 이동
  useEffect(() => {
    const target = moveFocus.current;
    moveFocus.current = null;
    if (target === "tab") {
      tabRef.current?.focus();
    }
    if (target === "start") {
      startRef.current?.focus();
    }
  }, [collapsed]);

  if (!mounted) {
    return null;
  }

  const toggle = (next: boolean) => {
    moveFocus.current = next ? "tab" : "start";
    writeCollapsed(next);
  };

  const hidden = footerVisible || cartOpen;

  return (
    <aside
      className={`match-float${collapsed ? " is-collapsed" : ""}${hidden ? " is-hidden" : ""}`}
      aria-label="내 취향 찾기 바로가기"
      inert={hidden}
    >
      <div className="mf-card">
        <span className="mf-heart" aria-hidden="true">
          ♡
        </span>
        <strong className="mf-title">내 취향 찾기</strong>
        <p className="mf-sub">
          하트로 고르는
          <br />
          나만의 샐러드
        </p>
        <Link ref={startRef} className="mf-start" href={MATCH_URL} aria-label="내 취향 찾기 시작하기">
          시작하기 ♡
        </Link>
        <button type="button" className="mf-close" aria-label="배너 접기" onClick={() => toggle(true)}>
          ×
        </button>
      </div>
      <button
        ref={tabRef}
        type="button"
        className="mf-tab"
        aria-label="내 취향 찾기 배너 펼치기"
        onClick={() => toggle(false)}
      >
        <span aria-hidden="true">♡</span>
      </button>
    </aside>
  );
}
