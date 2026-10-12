"use client";

import { useEffect, useRef } from "react";

let firstPage = true;

/**
 * 페이지의 h1. 첫 로드에서는 그대로 두고, 앱 안에서 다른 페이지로 이동해 왔을 때만
 * h1 로 포커스를 옮겨 화면 읽기 사용자가 새 페이지의 시작점을 알 수 있게 한다.
 */
export default function PageHeading({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (firstPage) {
      // 개발 모드(StrictMode)에서 effect 가 두 번 실행돼도 첫 로드로 판단되도록 플래그는 다음 틱에 내린다.
      const t = setTimeout(() => {
        firstPage = false;
      }, 0);
      return () => clearTimeout(t);
    }
    if (location.hash !== "#write") {
      ref.current?.focus({ preventScroll: true });
    }
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
