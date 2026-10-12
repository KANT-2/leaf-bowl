import { type CartItem } from "@/modules/cart/types";
import { isCustom, isDrink } from "@/modules/cart/identity";
import { dressingKeys } from "@/modules/cart/identifiers";
import { optionChoices, type CustomerCatalog } from "@/modules/catalog/customer-view";
export interface ChoiceSlot {
  /** 옵션 그룹 id. */
  groupId: string;
  /** 화면에 쓸 이름 (예: "사이즈") */
  label: string;
  value: string;
  choices: { value: string; name: string; available: boolean }[];
}

/** 장바구니 줄에서 바꿀 수 있는 단일 선택 옵션(관리자 정의 옵션 그룹). 드레싱은 dressingSlot 이 맡는다. 없으면 null */
export function choiceSlot(i: CartItem, cat: CustomerCatalog): ChoiceSlot | null {
  if (isDrink(i) || isCustom(i) || !i.optionSelections) {
    return null;
  }
  const group = cat.groupsFor(i.id).find((g) => !g.multiple && g.source !== "dressings");
  if (!group) {
    return null;
  }
  const value = i.optionSelections[group.id]?.[0] ?? "";
  const list = group.source === "custom" ? group.choices : optionChoices(cat.catalog, group.source);
  const choices = list.map((c) => ({
    value: c.id,
    name: c.name,
    available: true,
  }));
  // 품절 등으로 목록에서 빠진 현재 선택도 보이게 둔다 (고를 수는 없음).
  if (value && !choices.some((c) => c.value === value)) {
    const old = cat.catalog.products.find((p) => p.id === value) ?? group.choices.find((c) => c.id === value);
    choices.push({ value, name: old?.name || "판매 종료", available: false });
  }
  return {
    groupId: group.id,
    label: group.name.replace(/\s*선택$/, ""),
    value,
    choices,
  };
}

export interface DressingSlot {
  /** 옵션 그룹 id로 저장되는 상품이면 그 id, 예전 방식(dressing 번호) 줄이면 null */
  groupId: string | null;
  label: string;
  /** 지금 담긴 드레싱 (여러 개 가능) */
  selected: string[];
  choices: { value: string; name: string; available: boolean }[];
}

/** 장바구니 줄의 드레싱. 여러 개를 동시에 담을 수 있다. */
export function dressingSlot(i: CartItem, cat: CustomerCatalog): DressingSlot | null {
  if (isDrink(i)) {
    return null;
  }
  if (!isCustom(i)) {
    const group = cat.groupsFor(i.id).find((g) => g.source === "dressings");
    if (group) {
      const selected = i.optionSelections?.[group.id] ?? [];
      const choices = optionChoices(cat.catalog, "dressings").map((c) => ({
        value: c.id,
        name: c.name,
        available: true,
      }));
      // 품절 등으로 목록에서 빠진 현재 선택도 보이게 둔다 (해제는 가능).
      for (const value of selected) {
        if (!choices.some((c) => c.value === value)) {
          const old = cat.catalog.products.find((p) => p.id === value);
          choices.push({ value, name: old?.name || "판매 종료", available: false });
        }
      }
      return { groupId: group.id, label: "드레싱", selected, choices };
    }
  }
  const choices = cat.DRESSINGS.flatMap((d) => (d.name ? [{ value: d.id, name: d.name, available: d.available }] : []));
  if (!choices.length) {
    return null;
  }
  return { groupId: null, label: "드레싱", selected: dressingKeys(i), choices };
}

/** "드레싱" → "드레싱으로", "소스" → "소스로" (받침이 없거나 ㄹ 받침이면 "로") */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) {
    return `${word}(으)로`;
  }
  const jong = code % 28;
  return word + (jong === 0 || jong === 8 ? "로" : "으로");
}
