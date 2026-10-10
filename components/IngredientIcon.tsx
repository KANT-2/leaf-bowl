import Image from "next/image";
import type { Ingredient } from "@/lib/data/ingredients";

/** 재료명과 함께 쓰는 장식 이미지. 그릇 안에서는 부모가 접근성 트리에서 숨긴다. */
export default function IngredientIcon({ id }: Pick<Ingredient, "id">) {
  return (
    <Image
      className="ingredient-icon"
      src={`/images/ingredient-icons/${id}.webp`}
      alt=""
      width={96}
      height={96}
      unoptimized
      draggable={false}
    />
  );
}
