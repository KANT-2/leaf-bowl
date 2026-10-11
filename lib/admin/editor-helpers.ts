import type { OptionGroup, Product } from "./catalog";
export const statusNames = {
  active: "판매 중",
  soldout: "품절",
  hidden: "숨김",
};
export const uid = () => crypto.randomUUID();
export const blankProduct = (
  type: "salad" | "drink" | "dressing",
): Product => ({
  id: uid(),
  type,
  name: "",
  price: type === "salad" ? 9900 : type === "dressing" ? 0 : 3000,
  description: "",
  category:
    type === "salad"
      ? "든든한 단백질"
      : type === "dressing"
        ? "드레싱"
        : "음료",
  status: "hidden",
  badge: "",
  image: "",
  allergens: "",
  optionIds: [],
  deleted: false,
});
export const hasDressingOption = (p: Product, groups: OptionGroup[]) =>
  groups.some(
    (g) =>
      !g.deleted &&
      p.optionIds.includes(g.id) &&
      (g.source === "dressings" || g.id === "dressing"),
  );
export const hasDrinkOption = (p: Product, groups: OptionGroup[]) =>
  groups.some(
    (g) =>
      !g.deleted &&
      p.optionIds.includes(g.id) &&
      (g.source === "drinks" || g.id === "drinks"),
  );
export const blankGroup = (): OptionGroup => ({
  id: uid(),
  name: "",
  source: "custom",
  required: false,
  multiple: false,
  choices: [{ id: uid(), name: "", price: 0 }],
  deleted: false,
});
