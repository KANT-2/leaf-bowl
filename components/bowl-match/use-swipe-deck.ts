"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Ingredient } from "@/lib/data/ingredients";
import { decisionsStore, type Decision } from "@/lib/match";
import { useReducedMotion } from "@/lib/hooks";

/** 카드를 넘길 때 옆으로 날아가는 거리(px)와 기울기(도) */
const FLY_X = 420;
const FLY_DEG = 22;
/** 이만큼 끌면 선택으로 본다 (px) */
const SWIPE_AT = 70;

/** 같은 스타일 변경을 transition 없이 즉시 적용한다. */
function instant(el: HTMLElement, fn: () => void) {
  el.style.transition = "none";
  fn();
  void el.offsetWidth;
  el.style.transition = "";
}

export function useSwipeDeck(
  ingredients: Ingredient[],
  decisions: Decision[],
  toast: (message: string) => void,
) {
  const idx = decisions.length;
  const total = ingredients.length;
  const reduced = useReducedMotion();
  const ingredientIdentity = ingredients.map((i) => i.id).join("|");
  const active = useRef<(() => void) | null>(null);
  const setDecisions = (list: Decision[]) => decisionsStore.set(list);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; dx: number } | null>(null);
  /** 되돌리기 직후 카드가 들어올 방향 (1 오른쪽, -1 왼쪽, 0 없음) */
  const enterFrom = useRef(0);

  const lock = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

  useEffect(
    () => () => {
      active.current?.();
      active.current = null;
      busyRef.current = false;
      setBusy(false);
    },
    [ingredientIdentity],
  );

  /** 뒤 카드(다음 재료)를 끈 거리만큼 앞으로 당겨 보여준다. */
  const reveal = (distance: number) => {
    const n = nextRef.current;
    if (!n) return;
    const p = Math.min(Math.abs(distance) / 120, 1);
    n.style.transform = `translateY(${8 * (1 - p)}px) scale(${0.965 + 0.035 * p})`;
    n.style.filter = `brightness(${0.97 + 0.03 * p})`;
  };

  const setStamps = (yes: number, no: number) => {
    const c = cardRef.current;
    c?.querySelectorAll<HTMLElement>(".yes-stamp").forEach(
      (s) => (s.style.opacity = String(yes)),
    );
    c?.querySelectorAll<HTMLElement>(".no-stamp").forEach(
      (s) => (s.style.opacity = String(no)),
    );
  };

  // 카드가 바뀌면 끌던 위치를 즉시 원래대로 돌리고, 되돌리기였다면 넘어간 쪽에서 들어오게 한다.
  useLayoutEffect(() => {
    const c = cardRef.current;
    const n = nextRef.current;
    pointer.current = null;
    if (c)
      instant(c, () => {
        c.style.transform = "";
        c.style.opacity = "1";
        c.classList.remove("dragging");
      });
    setStamps(0, 0);
    if (n) instant(n, () => reveal(0));
    const dir = enterFrom.current;
    enterFrom.current = 0;
    if (dir && c && !reduced) {
      instant(c, () => {
        c.style.transform = `translateX(${dir * FLY_X}px) rotate(${dir * FLY_DEG}deg)`;
        c.style.opacity = "0";
      });
      requestAnimationFrame(() => {
        c.style.transform = "";
        c.style.opacity = "1";
      });
    }
  }, [idx, reduced, ingredientIdentity]);

  const choose = (liked: boolean) => {
    const c = cardRef.current;
    if (busyRef.current || idx >= total || !c) return;
    lock(true);
    pointer.current = null;
    c.classList.remove("dragging");
    const dir = liked ? 1 : -1;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      active.current = null;
      c.removeEventListener("transitionend", onEnd);
      clearTimeout(fallback);
      const now = decisionsStore.getSnapshot().slice(0, idx);
      setDecisions([
        ...now,
        { index: idx, liked, ingredientId: ingredients[idx].id },
      ]);
      lock(false);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === c && e.propertyName === "opacity") done();
    };
    c.addEventListener("transitionend", onEnd);
    const fallback = setTimeout(done, reduced ? 0 : 380);
    active.current = () => {
      finished = true;
      c.removeEventListener("transitionend", onEnd);
      clearTimeout(fallback);
    };
    reveal(120);
    c.style.transform = `translateX(${dir * FLY_X}px) rotate(${dir * FLY_DEG}deg)`;
    c.style.opacity = "0";
  };

  const undo = () => {
    if (busyRef.current || !idx) return;
    enterFrom.current = decisions[idx - 1].liked ? 1 : -1;
    setDecisions(decisions.slice(0, -1));
    toast("이전 선택으로 돌아왔어요");
    if (reduced) return;
    lock(true);
    const timer = setTimeout(() => {
      active.current = null;
      lock(false);
    }, 300);
    active.current = () => clearTimeout(timer);
  };

  const restart = () => {
    if (busyRef.current) return;
    setDecisions([]);
    toast("새로운 취향을 찾아보세요");
  };

  const removeIngredient = (id: string) => {
    if (busyRef.current) return;
    setDecisions(
      decisions.map((d) =>
        ingredients[d.index].id === id ? { ...d, liked: false } : d,
      ),
    );
  };

  /* ---- 카드 끌기 ---- */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busyRef.current || idx >= total || pointer.current) return;
    if (
      (e.target as HTMLElement).closest("button") ||
      (e.pointerType === "mouse" && e.button !== 0)
    )
      return;
    pointer.current = { id: e.pointerId, x: e.clientX, dx: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("dragging");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (busyRef.current || !p || p.id !== e.pointerId) return;
    p.dx = e.clientX - p.x;
    const angle = Math.max(-FLY_DEG, Math.min(FLY_DEG, p.dx / 14));
    e.currentTarget.style.transform = `translateX(${p.dx}px) rotate(${angle}deg)`;
    reveal(p.dx);
    setStamps(
      p.dx > 0 ? Math.min(p.dx / 90, 1) : 0,
      p.dx < 0 ? Math.min(-p.dx / 90, 1) : 0,
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, cancel = false) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    pointer.current = null;
    const c = e.currentTarget;
    c.classList.remove("dragging");
    if (!cancel && Math.abs(p.dx) > SWIPE_AT) {
      choose(p.dx > 0);
      return;
    }
    c.style.transform = "";
    c.style.opacity = "1";
    setStamps(0, 0);
    reveal(0);
  };

  const onCardKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      choose(true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      choose(false);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      undo();
    }
  };

  return {
    busy,
    busyRef,
    cardRef,
    nextRef,
    choose,
    undo,
    restart,
    removeIngredient,
    onPointerDown,
    onPointerMove,
    endDrag,
    onCardKey,
  };
}
