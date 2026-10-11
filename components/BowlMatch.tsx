"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCart } from "./CartProvider";
import { useToast } from "./ToastProvider";
import type { Ingredient } from "@/lib/data/ingredients";
import { useReducedMotion } from "@/lib/hooks";
import {
  BASE_BOWL_PRICE,
  STAGES,
  bowlPrice,
  decisionsStore,
  ingredientPhoto,
  mainIngredient,
  matchProduct,
  recipeStore,
  type Decision,
} from "@/lib/match";
import { money} from "@/lib/products";

const two = (n: number) => String(n).padStart(2, "0");
/** 카드를 넘길 때 옆으로 날아가는 거리(px)와 기울기(도) */
const FLY_X = 420;
const FLY_DEG = 22;
/** 이만큼 끌면 선택으로 본다 (px) */
const SWIPE_AT = 70;
const unique = (list: string[]) => [...new Set(list)];

/** 같은 스타일 변경을 transition 없이 즉시 적용한다. */
function instant(el: HTMLElement, fn: () => void) {
  el.style.transition = "none";
  fn();
  void el.offsetWidth;
  el.style.transition = "";
}

function CardFace({
  item,
  index,
  front = false,
}: {
  item: Ingredient;
  index: number;
  front?: boolean;
}) {
  return (
    <>
      <div className="ingredient-visual" style={{ background: item.color }}>
        <span className="number">INGREDIENT {two(index + 1)}</span>
        <span className="category">{item.group}</span>
        <Image
          className="ingredient-photo"
          src={item.image || ingredientPhoto(item.id)}
          alt={item.name}
          width={1254}
          height={1254}
          sizes="380px"
          draggable={false}
          loading={front ? "eager" : "lazy"}
        />
      </div>
      <div className="ingredient-info">
        <h2>{item.name}</h2>
        <p>{item.desc}</p>
        <div className="ingredient-bottom">
          <span>
            {item.allergens.length
              ? `알레르기: ${item.allergens.join(", ")}`
              : "주요 알레르기 표기 없음"}
          </span>
          <strong>
            {item.price ? `+ ${money(item.price)}` : "기본 볼에 포함"}
          </strong>
        </div>
      </div>
      {front && (
        <>
          <div className="swipe-stamp yes-stamp">LOVE IT</div>
          <div className="swipe-stamp no-stamp">NEXT</div>
        </>
      )}
    </>
  );
}

/** 재료를 모두 고른 뒤 카드 자리에 나오는 완료 카드. 버튼은 맨 앞 카드에만 둔다. */
function DoneCard({
  count,
  onFinish,
  onRestart,
}: {
  count: number;
  onFinish?: () => void;
  onRestart?: () => void;
}) {
  return (
    <div className="done-card">
      <span aria-hidden="true">♡</span>
      <h2>
        당신의 취향,
        <br />한 그릇에 모였어요.
      </h2>
      <p>
        {count}가지 재료를 선택했어요.
        <br />
        드레싱을 더해 완성해볼까요?
      </p>
      {onFinish && onRestart && (
        <>
          <button
            type="button"
            className="primary"
            onClick={count ? onFinish : onRestart}
          >
            {count ? "내 샐러드 완성하기" : "다시 고르기"} ↗
          </button>
          <button type="button" className="secondary" onClick={onRestart}>
            처음부터 다시
          </button>
        </>
      )}
    </div>
  );
}

/**
 * 재료 카드를 좌우로 넘겨 나만의 샐러드를 만드는 화면 (예전 public/bowl-match 정적 페이지를 옮김).
 * "내 조합 저장하기"로 남긴 조합만 예전과 같은 localStorage 키(bm-recipe)를 써서 방문이 바뀌어도
 * 남는다. 지금 넘기고 있는 카드 진행 상황은 이번 방문에서만 유지된다.
 */
export default function BowlMatch() {
  const { ingredients,revision,visibleProducts,DRESSINGS }=useCustomerCatalog();
  if(!ingredients.length||!visibleProducts.length||!DRESSINGS.some(d=>d.available))return <p role="status">현재 조합할 수 있는 재료와 메뉴를 준비 중입니다.</p>;
  return <BowlMatchBody key={revision} ingredients={ingredients}/>;
}
function BowlMatchBody({ingredients}:{ingredients:Ingredient[]}) {
  const { DRESSINGS, PRODUCTS, photoSrc } = useCustomerCatalog();
  const { addCustom, open } = useCart();
  const toast = useToast();
  const reduced = useReducedMotion();
  const total = ingredients.length;

  const saved = useSyncExternalStore(
    decisionsStore.subscribe,
    decisionsStore.getSnapshot,
    decisionsStore.getServerSnapshot,
  );
  const recipe = useSyncExternalStore(
    recipeStore.subscribe,
    recipeStore.getSnapshot,
    recipeStore.getServerSnapshot,
  );
  // 재료 목록이 줄어든 경우를 위해 지금 목록 길이까지만 쓴다.
  const invalid=saved.findIndex(d=>d.ingredientId&&d.ingredientId!==ingredients[d.index]?.id);
  const decisions=saved.slice(0,invalid<0?total:invalid);
  const idx = decisions.length;
  const item = ingredients[idx];
  const next = ingredients[idx + 1];
  const selected = decisions
    .filter((d) => d.liked)
    .map((d) => ingredients[d.index]).filter(Boolean);
  const ids = selected.map((i) => i.id);
  const price = bowlPrice(selected);
  const savedRecipe =
    recipe &&
    DRESSINGS.some((d) => d.id === recipe.dressingKey && d.available) &&
    recipe.ingredients.every((id) => ingredients.some((i) => i.id === id))
      ? recipe
      : null;

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; dx: number } | null>(null);
  /** 되돌리기 직후 카드가 들어올 방향 (1 오른쪽, -1 왼쪽, 0 없음) */
  const enterFrom = useRef(0);

  const [confirm, setConfirm] = useState(false);
  const confirming = confirm && selected.length > 0;
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const focusClear = useRef<"ask" | "button" | null>(null);
  const clearBtn = useRef<HTMLButtonElement>(null);
  const clearNo = useRef<HTMLButtonElement>(null);

  const [resultOpen, setResultOpen] = useState(false);
  const [name, setName] = useState("");
  const [dressingId, setDressing] = useState(DRESSINGS.find(d => d.available)?.id ?? "");
  const dressing = DRESSINGS.findIndex((d) => d.id === dressingId);
  const [savedNote, setSavedNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const makeBtn = useRef<HTMLButtonElement>(null);

  const setDecisions = (list: Decision[]) => decisionsStore.set(list);

  // 다른 페이지로 갔다 돌아와도(Activity로 숨겨졌다 다시 보여도) 카드 진행 상황과 결과 창은
  // 유지하지 않고 새로 시작한다. "내 조합 저장하기"로 남긴 조합(recipeStore)은 건드리지 않는다.
  useLayoutEffect(() => {
    return () => {
      decisionsStore.set([]);
      setResultOpen(false);
      setSavedNote("");
    };
  }, []);

  const lock = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

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
  }, [idx, reduced]);

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
      c.removeEventListener("transitionend", onEnd);
      clearTimeout(fallback);
      const now = decisionsStore.getSnapshot().slice(0, idx);
      setDecisions([...now, { index: idx, liked, ingredientId: ingredients[idx].id }]);
      lock(false);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === c && e.propertyName === "opacity") done();
    };
    c.addEventListener("transitionend", onEnd);
    const fallback = setTimeout(done, reduced ? 0 : 380);
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
    setTimeout(() => lock(false), 300);
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

  /* ---- 전체 삭제 (2단계 확인, 4초 뒤 자동 취소) ---- */
  const askClear = (v: boolean) => {
    clearTimeout(clearTimer.current);
    if (v) clearTimer.current = setTimeout(() => setConfirm(false), 4000);
    focusClear.current = v ? "ask" : "button";
    setConfirm(v);
  };

  const clearAll = () => {
    if (busyRef.current) return;
    clearTimeout(clearTimer.current);
    setConfirm(false);
    setDecisions([]);
    toast("선택한 재료를 모두 삭제했어요");
  };

  useEffect(() => {
    const target = focusClear.current;
    focusClear.current = null;
    if (target === "ask") clearNo.current?.focus();
    if (target === "button" && clearBtn.current && !clearBtn.current.disabled)
      clearBtn.current.focus();
  }, [confirming]);

  useEffect(() => () => clearTimeout(clearTimer.current), []);

  /* ---- 결과 창 ---- */
  const showResult = (
    preset?: { name: string; dressingKey?: string },
    list = selected,
  ) => {
    if (busyRef.current) return;
    if (!list.length) {
      toast("좋아하는 재료를 먼저 담아주세요");
      return;
    }
    setName(preset?.name ?? `나의 ${mainIngredient(list).name} 볼`);
    setDressing(preset?.dressingKey ?? DRESSINGS.find((d) => d.available)?.id ?? "");
    setSavedNote("");
    setResultOpen(true);
  };

  // 화면을 떠나면(다른 페이지로 이동해 숨겨질 때 포함) 모달을 닫아 둔다.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d || !resultOpen) return;
    if (!d.open) d.showModal();
    return () => d.close();
  }, [resultOpen]);

  const loadRecipe = () => {
    if (busyRef.current || !savedRecipe) return;
    const list = ingredients.map((i, index) => ({
      index,ingredientId:i.id,
      liked: savedRecipe.ingredients.includes(i.id),
    }));
    setDecisions(list);
    showResult(
      { name: savedRecipe.name, dressingKey: savedRecipe.dressingKey },
      list.filter((d) => d.liked).map((d) => ingredients[d.index]),
    );
    toast("저장한 조합을 불러왔어요");
  };

  const recipeName = () => (name.trim() || "나의 샐러드").slice(0, 30);

  const saveRecipe = () => {
    const n = recipeName();
    recipeStore.set({
      name: n,
      ingredients: ids,
      dressing,
      dressingKey: dressingId,
      price,
      savedAt: new Date().toISOString(),
    });
    setSavedNote(`${n} · 다시 방문하면 저장한 조합을 불러올 수 있어요.`);
    toast("내 조합을 이 브라우저에 저장했어요");
  };

  const addToCart = () => {
    if(!DRESSINGS[dressing]?.available){toast("선택한 드레싱이 품절되었습니다. 다른 드레싱을 선택해주세요.");return;}
    addCustom({
      name: recipeName(),
      ingredientIds: selected.map((i)=>i.id),
      ingredients: selected.map((i) => i.name),
      allergens: unique(selected.flatMap((i) => i.allergens)),
      dressing,
      dressingKey: dressingId,
      price,
      photo: similar.id,
    });
    dialogRef.current?.close();
    open(makeBtn.current);
  };

  const similar = PRODUCTS.find(p=>p?.id===matchProduct(selected.length?mainIngredient(selected).id:"")&&p.status==='active') ?? PRODUCTS.find(p=>p?.status==='active') ?? PRODUCTS.find(p=>p?.status!=='hidden')!;
  const resultAllergens = unique([
    ...selected.flatMap((i) => i.allergens),
    ...DRESSINGS[dressing]?.allergens ?? [],
  ]);

  return (
    <div className="workspace">
      <aside className="guide">
        <span className="step-label">HOW TO MATCH</span>
        <h2>
          취향에도
          <br />
          레시피가 있죠.
        </h2>
        {[
          ["재료를 만나요", "채소부터 단백질, 토핑까지."],
          ["마음이 가면 하트", "카드를 오른쪽으로 넘겨주세요."],
          ["내 샐러드 완성", "선택한 재료로 나만의 한 그릇."],
        ].map(([title, text], n) => (
          <div className="guide-step" key={title}>
            <span>{two(n + 1)}</span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </div>
        ))}
        <div className="little-note">
          No wrong answers.
          <br />
          <i>Just your kind of fresh.</i>
        </div>
      </aside>

      <section className="deck-area" aria-label="샐러드 재료 카드">
        <div className="deck-meta">
          <span>
            {item
              ? `${two(STAGES.indexOf(item.stage) + 1)} / ${item.stage}`
              : "YOUR BOWL IS READY"}
          </span>
          <span>
            {Math.min(idx + 1, total)} / {total}
          </span>
        </div>
        <div className="progress-track">
          <div
            className="progress-bar"
            style={{ width: `${(idx / total) * 100}%` }}
          />
        </div>
        <div className="card-stack">
          <div
            className="swipe-card preview-card"
            ref={nextRef}
            aria-hidden="true"
            inert
            hidden={!item}
          >
            {item &&
              (next ? (
                <CardFace item={next} index={idx + 1} />
              ) : (
                <DoneCard count={selected.length} />
              ))}
          </div>
          <div
            className="swipe-card"
            ref={cardRef}
            tabIndex={0}
            aria-label={
              item
                ? `${item.name}. 오른쪽 화살표로 추가, 왼쪽 화살표로 건너뛰기.`
                : "재료 선택 완료"
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e)}
            onPointerCancel={(e) => endDrag(e, true)}
            onLostPointerCapture={(e) => endDrag(e, true)}
            onKeyDown={onCardKey}
          >
            {item ? (
              <CardFace item={item} index={idx} front />
            ) : (
              <DoneCard
                count={selected.length}
                onFinish={() => showResult()}
                onRestart={restart}
              />
            )}
          </div>
        </div>
        <div className="swipe-actions">
          <button
            type="button"
            className="undo"
            aria-label="이전 선택 취소"
            disabled={busy || !idx}
            onClick={undo}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
          </button>
          <button
            type="button"
            className="skip"
            aria-label="재료 건너뛰기"
            disabled={busy || !item}
            onClick={() => choose(false)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <button
            type="button"
            className="like"
            aria-label="재료 추가하기"
            disabled={busy || !item}
            onClick={() => choose(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.9 1.2-1.8 2.8-2.9 4.8-2.9 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4Z" /></svg>
          </button>
          <button
            type="button"
            className="finish"
            aria-label="샐러드 완성"
            disabled={busy || !selected.length}
            onClick={() => showResult()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </button>
        </div>
        <p className="swipe-help">
          기울이면 다음 재료가 보여요 <span>← 패스 · 좋아요 →</span>
        </p>
      </section>

      <aside className="my-bowl" aria-label="내가 고른 재료">
        <div className="bowl-top">
          <h2>My little bowl</h2>
          <span>{selected.length}</span>
        </div>
        <div className="bowl-sub-row">
          {!confirming && (
            <p className="bowl-subtitle">한 번의 하트, 한 가지 취향.</p>
          )}
          <div className="clear-area">
            {confirming ? (
              <>
                <span className="clear-q">정말 삭제할까요?</span>
                <button type="button" className="clear-yes" onClick={clearAll}>
                  삭제
                </button>
                <button
                  type="button"
                  className="clear-no"
                  ref={clearNo}
                  onClick={() => askClear(false)}
                >
                  취소
                </button>
              </>
            ) : (
              <button
                type="button"
                className="clear-btn"
                ref={clearBtn}
                disabled={!selected.length || busy}
                aria-label="선택한 재료 전체 삭제"
                onClick={() => askClear(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
                전체 삭제
              </button>
            )}
          </div>
        </div>
        <div className="bowl-illustration">
          <svg viewBox="0 0 240 160" aria-hidden="true">
            <ellipse
              cx="120"
              cy="82"
              rx="86"
              ry="29"
              fill="#F6F7F1"
              stroke="#D9DFCD"
              strokeWidth="2"
            />
            <path
              d="M34 82c7 60 42 66 86 66s79-6 86-66c-26 34-146 34-172 0Z"
              fill="#F8F6EF"
              stroke="#D9DFCD"
              strokeWidth="2"
            />
            <path
              d="M62 112c16 11 31 17 49 18"
              fill="none"
              stroke="#E9EDE2"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          <div className="bowl-bits" aria-hidden="true">
            {selected.map((i) => (
              <span key={i.id}>{i.emoji}</span>
            ))}
          </div>
        </div>
        <div className="selected-ingredients">
          {selected.length ? (
            selected.map((i) => (
              <span className="ingredient-chip" key={i.id}>
                {i.name}
                <button
                  type="button"
                  aria-label={`${i.name} 빼기`}
                  onClick={() => removeIngredient(i.id)}
                >
                  ×
                </button>
              </span>
            ))
          ) : (
            <p className="empty-bowl">
              아직 비어 있어요.
              <br />첫 번째 하트를 보내볼까요?
            </p>
          )}
        </div>
        <div className="bowl-footer">
          <div>
            <span>예상 금액</span>
            <strong>{money(price)}</strong>
          </div>
          <button
            type="button"
            ref={makeBtn}
            className="primary"
            disabled={!selected.length}
            onClick={() => showResult()}
          >
            내 샐러드 완성하기 ↗
          </button>
          <p>기본 볼 {money(BASE_BOWL_PRICE)} + 선택 재료</p>
          {savedRecipe && (
            <button
              type="button"
              className="secondary load-recipe"
              onClick={loadRecipe}
            >
              저장한 조합 불러오기
            </button>
          )}
        </div>
      </aside>

      <dialog
        ref={dialogRef}
        className="bm-result"
        aria-labelledby="bmResultTitle"
        onClose={() => setResultOpen(false)}
      >
        {resultOpen && selected.length > 0 && (
          <>
            <div className="dialog-top">
              <span className="eyebrow">IT’S A BOWL MATCH!</span>
              <button
                type="button"
                className="close"
                aria-label="닫기"
                onClick={() => dialogRef.current?.close()}
              >
                ×
              </button>
            </div>
            <h2 id="bmResultTitle">이 한 그릇, 완전 내 취향.</h2>
            <p>{selected.length}가지 재료로 만든 나만의 조합</p>
            <Image
              className="result-photo"
              src={photoSrc(similar.id)}
              alt="완성 샐러드 분위기 참고 사진"
              width={1024}
              height={1024}
              sizes="220px"
            />
            <p className="result-note">
              사진은 선택한 재료와 비슷한 조합의 참고 이미지입니다.
            </p>
            <div className="result-chips">
              {selected.map((i) => (
                <span key={i.id}>
                  {i.emoji} {i.name}
                </span>
              ))}
            </div>
            <label className="field">
              <span>내 샐러드 이름</span>
              <input
                maxLength={30}
                placeholder="예: 오늘의 초록 한 그릇"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>마지막으로, 드레싱</span>
              <select
                value={dressingId}
                onChange={(e) => setDressing(e.target.value)}
              >
                {DRESSINGS.map((d) =>
                  d.name ? (
                    <option key={d.id} value={d.id} disabled={!d.available}>
                      {d.name}
                      {d.allergens.length ? ` (${d.allergens.join(", ")})` : ""}
                      {d.available ? "" : " · 품절"}
                    </option>
                  ) : null,
                )}
              </select>
            </label>
            <div className="allergen-box">
              주요 알레르기 재료:{" "}
              {resultAllergens.join(", ") || "표기 대상 없음"}. 공용 조리
              공간에서 우유, 대두, 밀, 계란, 견과류, 새우, 생선 등을 취급하며
              교차 접촉이 발생할 수 있습니다.
            </div>
            <div className="result-price">
              <span>내 볼 예상 금액</span>
              <strong>{money(price)}</strong>
            </div>
            <button
              type="button"
              className="primary add-cart"
              onClick={addToCart}
            >
              장바구니에 담기
            </button>
            <div className="dialog-buttons">
              <button type="button" className="secondary" onClick={saveRecipe}>
                {savedNote ? "저장 완료 ✓" : "내 조합 저장하기 ♡"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => dialogRef.current?.close()}
              >
                재료 다시 고르기
              </button>
            </div>
            <Link
              className="similar-link"
              href={`/product/${similar.id}`}
              onClick={() => dialogRef.current?.close()}
            >
              비슷한 메뉴 보기 · {similar.name} ↗
            </Link>
            {savedNote && <p className="result-note">{savedNote}</p>}
          </>
        )}
      </dialog>
    </div>
  );
}
