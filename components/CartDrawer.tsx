"use client";

import type { DeliveryHours } from "@/lib/data/delivery";
import { useEffect, useRef } from "react";
import CartBody from "./cart/CartBody";
import { useCart } from "./CartProvider";

const FOCUSABLE =
  "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)";

export default function CartDrawer({ hours }: { hours: DeliveryHours }) {
  const { isOpen, openedAt, close } = useCart();
  const drawer = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // 열려 있는 동안: 본문 스크롤 잠금, Esc 로 닫기, Tab 순환, 닫기 버튼에 포커스
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("lock");
    const focusTimer = setTimeout(
      () => closeBtn.current?.focus({ preventScroll: true }),
      60,
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !drawer.current) return;
      const f = [
        ...drawer.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (!drawer.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      document.body.classList.remove("lock");
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  return (
    <>
      <div
        className={`scrim${isOpen ? " show" : ""}`}
        onClick={() => close()}
        aria-hidden="true"
      />
      <aside
        ref={drawer}
        className={`drawer${isOpen ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="장바구니"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        {openedAt !== null && (
          <CartBody openedAt={openedAt} hours={hours} closeBtn={closeBtn} />
        )}
      </aside>
    </>
  );
}
