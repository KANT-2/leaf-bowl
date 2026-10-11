import Image from "next/image";
import type { Ingredient } from "@/lib/data/ingredients";
import { ingredientPhoto } from "@/lib/match";
import { money } from "@/lib/products";
const two = (n: number) => String(n).padStart(2, "0");

export function CardFace({
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
export function DoneCard({
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
