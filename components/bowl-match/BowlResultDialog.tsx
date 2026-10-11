"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Ingredient } from "@/lib/data/ingredients";
import type { Product } from "@/types/product";
import type { CustomerCatalog } from "@/lib/customer/catalog";
import { money } from "@/lib/products";

interface Props {
  resultOpen: boolean;
  selected: Ingredient[];
  name: string;
  dressing: string;
  dressings: CustomerCatalog["DRESSINGS"];
  similar: Product;
  photo: string;
  price: number;
  savedNote: string;
  resultAllergens: string[];
  onName: (value: string) => void;
  onDressing: (value: string) => void;
  onClosed: () => void;
  onSave: () => void;
  onAdd: () => void;
}
export default function BowlResultDialog({
  resultOpen,
  selected,
  name,
  dressing,
  dressings,
  similar,
  photo,
  price,
  savedNote,
  resultAllergens,
  onName,
  onDressing,
  onClosed,
  onSave,
  onAdd,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !resultOpen || !selected.length) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, [resultOpen, selected.length]);
  return (
    <dialog
      ref={dialogRef}
      className="bm-result"
      aria-labelledby="bmResultTitle"
      onClose={() => onClosed()}
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
            src={photo}
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
              onChange={(e) => onName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>마지막으로, 드레싱</span>
            <select
              value={dressing}
              onChange={(e) => onDressing(e.target.value)}
            >
              {dressings.map((d) =>
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
            주요 알레르기 재료: {resultAllergens.join(", ") || "표기 대상 없음"}
            . 공용 조리 공간에서 우유, 대두, 밀, 계란, 견과류, 새우, 생선 등을
            취급하며 교차 접촉이 발생할 수 있습니다.
          </div>
          <div className="result-price">
            <span>내 볼 예상 금액</span>
            <strong>{money(price)}</strong>
          </div>
          <button type="button" className="primary add-cart" onClick={onAdd}>
            장바구니에 담기
          </button>
          <div className="dialog-buttons">
            <button type="button" className="secondary" onClick={onSave}>
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
  );
}
