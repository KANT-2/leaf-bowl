"use client";

import { useCustomerCatalog } from "./CustomerCatalogProvider";
import BowlResultDialog from "./bowl-match/BowlResultDialog";
import { CardFace, DoneCard } from "./bowl-match/MatchCards";
import { useSwipeDeck } from "./bowl-match/use-swipe-deck";
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
import {
  BASE_BOWL_PRICE,
  STAGES,
  bowlPrice,
  decisionsStore,
  mainIngredient,
  matchProduct,
  recipeStore,
  type Decision,
} from "@/lib/match";
import { money } from "@/lib/products";

const two = (n: number) => String(n).padStart(2, "0");
const unique = (list: string[]) => [...new Set(list)];

/**
 * 재료 카드를 좌우로 넘겨 나만의 샐러드를 만드는 화면 (예전 public/bowl-match 정적 페이지를 옮김).
 * "내 조합 저장하기"로 남긴 조합만 예전과 같은 localStorage 키(bm-recipe)를 써서 방문이 바뀌어도
 * 남는다. 지금 넘기고 있는 카드 진행 상황은 이번 방문에서만 유지된다.
 */
export default function BowlMatch() {
  const { ingredients, visibleProducts, DRESSINGS } = useCustomerCatalog();
  if (
    !ingredients.length ||
    !visibleProducts.length ||
    !DRESSINGS.some((d) => d.available)
  )
    return (
      <p role="status">현재 조합할 수 있는 재료와 메뉴를 준비 중입니다.</p>
    );
  return <BowlMatchBody ingredients={ingredients} />;
}
function BowlMatchBody({ ingredients }: { ingredients: Ingredient[] }) {
  const { DRESSINGS, PRODUCTS, photoSrc } = useCustomerCatalog();
  const { addCustom, open } = useCart();
  const toast = useToast();
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
  const invalid = saved.findIndex(
    (d) => d.ingredientId && d.ingredientId !== ingredients[d.index]?.id,
  );
  const decisions = saved.slice(0, invalid < 0 ? total : invalid);
  const idx = decisions.length;
  const item = ingredients[idx];
  const next = ingredients[idx + 1];
  const selected = decisions
    .filter((d) => d.liked)
    .map((d) => ingredients[d.index])
    .filter(Boolean);
  const ids = selected.map((i) => i.id);
  const price = bowlPrice(selected);
  const savedRecipe =
    recipe &&
    DRESSINGS.some((d) => d.id === recipe.dressingKey && d.available) &&
    recipe.ingredients.every((id) => ingredients.some((i) => i.id === id))
      ? recipe
      : null;

  const {
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
  } = useSwipeDeck(ingredients, decisions, toast);

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
  const [dressingId, setDressing] = useState(
    DRESSINGS.find((d) => d.available)?.id ?? "",
  );
  const dressing = DRESSINGS.findIndex((d) => d.id === dressingId);
  const [savedNote, setSavedNote] = useState("");
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
    setDressing(
      preset?.dressingKey ?? DRESSINGS.find((d) => d.available)?.id ?? "",
    );
    setSavedNote("");
    setResultOpen(true);
  };

  const loadRecipe = () => {
    if (busyRef.current || !savedRecipe) return;
    const list = ingredients.map((i, index) => ({
      index,
      ingredientId: i.id,
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
    if (!DRESSINGS[dressing]?.available) {
      toast("선택한 드레싱이 품절되었습니다. 다른 드레싱을 선택해주세요.");
      return;
    }
    addCustom({
      name: recipeName(),
      ingredientIds: selected.map((i) => i.id),
      ingredients: selected.map((i) => i.name),
      allergens: unique(selected.flatMap((i) => i.allergens)),
      dressing,
      dressingKey: dressingId,
      price,
      photo: similar.id,
    });
    setResultOpen(false);
    open(makeBtn.current);
  };

  const similar =
    PRODUCTS.find(
      (p) =>
        p?.id ===
          matchProduct(selected.length ? mainIngredient(selected).id : "") &&
        p.status === "active",
    ) ??
    PRODUCTS.find((p) => p?.status === "active") ??
    PRODUCTS.find((p) => p?.status !== "hidden")!;
  const resultAllergens = unique([
    ...selected.flatMap((i) => i.allergens),
    ...(DRESSINGS[dressing]?.allergens ?? []),
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
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button
            type="button"
            className="skip"
            aria-label="재료 건너뛰기"
            disabled={busy || !item}
            onClick={() => choose(false)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <button
            type="button"
            className="like"
            aria-label="재료 추가하기"
            disabled={busy || !item}
            onClick={() => choose(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.9 1.2-1.8 2.8-2.9 4.8-2.9 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4Z" />
            </svg>
          </button>
          <button
            type="button"
            className="finish"
            aria-label="샐러드 완성"
            disabled={busy || !selected.length}
            onClick={() => showResult()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
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

      <BowlResultDialog
        resultOpen={resultOpen}
        selected={selected}
        name={name}
        dressing={dressingId}
        dressings={DRESSINGS}
        similar={similar}
        photo={photoSrc(similar.id)}
        price={price + (DRESSINGS[dressing]?.price ?? 0)}
        savedNote={savedNote}
        resultAllergens={resultAllergens}
        onName={setName}
        onDressing={setDressing}
        onClosed={() => setResultOpen(false)}
        onSave={saveRecipe}
        onAdd={addToCart}
      />
    </div>
  );
}
