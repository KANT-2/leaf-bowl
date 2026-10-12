"use client";
import { Button } from "@/components/admin/button";
import { Checkbox } from "@/components/admin/checkbox";
import { Input } from "@/components/admin/input";
import { Textarea } from "@/components/admin/textarea";
import { ingredientAllergens, matchesIngredient } from "@/modules/catalog/allergens";
import { type Catalog, type OptionGroup, type Product } from "@/modules/catalog/schema";
import { statusNames } from "@/features/admin/editor-helpers";
import { Check, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Picker, Upload } from "./EditorFields";

export default function ProductForm({
  initial,
  groups,
  categories,
  ingredients,
  busy,
  onCancel,
  onSave,
  onRefresh,
  onManageIngredients,
}: {
  onManageIngredients: () => void;
  initial: Product;
  ingredients: NonNullable<Catalog["ingredients"]>;
  categories: string[];
  groups: OptionGroup[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onCancel: () => void;
  onSave: (p: Product) => Promise<void>;
}) {
  const [p, setP] = useState(initial),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [ingredientCategory, setIngredientCategory] = useState("전체");
  const availableIngredients = ingredients.filter((ingredient) => !ingredient.deleted);
  const tokens = (p.ingredients ?? "")
    .split(/[·,，、;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const inferred = ingredientAllergens(p.ingredients ?? "", ingredients);
  const updateIngredients = (value: string) =>
    setP((x) => ({
      ...x,
      ingredients: value,
      allergens: ingredientAllergens(value, ingredients).allergens,
    }));

  const set = <K extends keyof Product>(key: K, value: Product[K]) => setP((x) => ({ ...x, [key]: value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave({
            ...p,
            optionIds: p.optionIds.filter((id) => groups.some((g) => g.id === id)),
          });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <fieldset disabled={busy || uploading}>
        <div className="menu-basics">
          <label className="field">
            메뉴 이름
            <Input
              value={p.name}
              required
              maxLength={80}
              onChange={(e) => set("name", e.target.value)}
              placeholder="예: 레몬 치킨 아보카도"
            />
          </label>
          {p.type === "salad" && (
            <label className="field">
              영문 이름
              <Input maxLength={100} value={p.en ?? ""} onChange={(e) => set("en", e.target.value)} />
            </label>
          )}
          <label className="field">
            가격(원)
            <Input
              type="number"
              required
              min={0}
              max={1000000}
              step={1}
              value={p.price}
              onChange={(e) => set("price", e.target.valueAsNumber || 0)}
            />
          </label>
          <div className="field menu-image-field">
            <span>메뉴 이미지</span>
            <Upload value={p.image} onChange={(v) => set("image", v)} onBusy={setUploading} />
          </div>
          <label className="field">
            메뉴 설명
            <Textarea
              value={p.description}
              maxLength={600}
              onChange={(e) => set("description", e.target.value)}
              placeholder="로메인 · 치킨 · 아보카도"
            />
          </label>
        </div>
        <details className="menu-extra" open={p.type !== "salad"}>
          <summary>분류·판매 상태·배지·옵션 설정</summary>
          <div className="menu-settings-grid">
            <label className="field">
              메뉴 분류
              <Picker
                value={p.category}
                label="메뉴 분류"
                onChange={(v) => set("category", v)}
                options={
                  p.type === "dressing"
                    ? [["드레싱", "드레싱"]]
                    : p.type === "drink"
                      ? [["음료", "음료"]]
                      : categories.map((x) => [x, x])
                }
              />
            </label>
            <label className="field">
              판매 상태
              <Picker
                value={p.status}
                label="판매 상태"
                onChange={(v) => set("status", v as Product["status"])}
                options={Object.entries(statusNames)}
              />
            </label>
            <label className="field">
              배지
              <Picker
                value={p.badge}
                label="배지"
                onChange={(v) => set("badge", v as Product["badge"])}
                options={["", "BEST", "NEW", "PLANT", "PICK"].map((v) => [v, v || "배지 없음"])}
              />
            </label>
            {p.type === "salad" && (
              <div className="field">
                연결할 옵션 그룹
                {groups.map((g) => (
                  <label className="check-line" key={g.id}>
                    <Checkbox
                      checked={p.optionIds.includes(g.id)}
                      onCheckedChange={(v) =>
                        set("optionIds", v ? [...p.optionIds, g.id] : p.optionIds.filter((x) => x !== g.id))
                      }
                    />
                    {g.name}
                  </label>
                ))}
                {!groups.length && <div className="meta">옵션 관리에서 그룹을 먼저 등록해주세요.</div>}
              </div>
            )}
            {p.type !== "salad" && (
              <label className="field">
                알레르기 안내
                <Input
                  value={p.allergens}
                  maxLength={400}
                  onChange={(e) => set("allergens", e.target.value)}
                  placeholder="예: 우유, 대두, 밀"
                />
              </label>
            )}
          </div>
        </details>
        {p.type === "salad" && (
          <section className="menu-ingredients">
            <div className="menu-ingredients-heading">
              <h3>
                구성 재료 <span>{tokens.length}개 선택</span>
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={onManageIngredients}>
                재료 관리 ›
              </Button>
            </div>
            <div className="menu-selected-ingredients">
              {tokens.map((token, index) => (
                <button
                  type="button"
                  className="menu-ingredient-chip"
                  key={`${token}-${index}`}
                  aria-label={`${token} 제거`}
                  onClick={() => updateIngredients(tokens.filter((_, i) => i !== index).join(" · "))}
                >
                  {token}
                  <X size={14} />
                </button>
              ))}
              {!tokens.length && <span className="meta">아래에서 구성 재료를 선택해주세요.</span>}
            </div>
            <div className="menu-ingredient-search">
              <Search size={18} aria-hidden="true" />
              <Input
                aria-label="구성 재료 검색"
                placeholder="재료 검색"
                value={ingredientQuery}
                onChange={(e) => setIngredientQuery(e.target.value)}
              />
            </div>
            <div className="menu-ingredient-filters">
              {["전체", ...new Set(availableIngredients.map((ingredient) => ingredient.category))].map((category) => (
                <Button
                  type="button"
                  key={category}
                  variant={ingredientCategory === category ? "default" : "outline"}
                  aria-pressed={ingredientCategory === category}
                  onClick={() => setIngredientCategory(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
            <div className="menu-ingredient-cards">
              {availableIngredients
                .filter(
                  (ingredient) =>
                    (ingredientCategory === "전체" || ingredient.category === ingredientCategory) &&
                    `${ingredient.name} ${ingredient.category}`
                      .toLowerCase()
                      .includes(ingredientQuery.trim().toLowerCase()),
                )
                .map((ingredient) => {
                  const selected = tokens.some((token) => matchesIngredient(token, ingredient));
                  return (
                    <button
                      type="button"
                      key={ingredient.id}
                      aria-pressed={selected}
                      className={selected ? "is-selected" : ""}
                      onClick={() => {
                        const remaining = tokens.filter((token) => !matchesIngredient(token, ingredient));
                        const next = (selected ? remaining : [...remaining, ingredient.name]).join(" · ");
                        if (next.length > 600) {
                          setError("구성 재료는 600자까지 입력할 수 있습니다.");
                          return;
                        }
                        setError("");
                        updateIngredients(next);
                      }}
                    >
                      {selected && <Check size={18} aria-hidden="true" />}
                      {ingredient.name}
                    </button>
                  );
                })}
            </div>
            {!availableIngredients.some(
              (ingredient) =>
                (ingredientCategory === "전체" || ingredient.category === ingredientCategory) &&
                `${ingredient.name} ${ingredient.category}`
                  .toLowerCase()
                  .includes(ingredientQuery.trim().toLowerCase()),
            ) && (
              <p className="meta">
                {availableIngredients.length ? "검색 결과가 없습니다." : "재료 관리에서 재료를 먼저 등록해주세요."}
              </p>
            )}
            <div className="menu-allergy-summary" role="status">
              <ShieldCheck size={20} aria-hidden="true" />
              <strong>알레르기</strong>
              <span>{p.allergens || "등록된 안내 없음"}</span>
            </div>
            <p className="meta">알레르기 안내는 등록한 재료 정보에서 자동 반영됩니다.</p>
            {inferred.unknown.length > 0 && <p className="meta">등록 재료 확인 필요: {inferred.unknown.join(", ")}</p>}
            <details className="menu-extra">
              <summary>구성 재료·알레르기 직접 보완</summary>
              <label className="field">
                구성 재료
                <Textarea
                  maxLength={600}
                  value={p.ingredients ?? ""}
                  onChange={(e) => updateIngredients(e.target.value)}
                />
              </label>
              <label className="field">
                알레르기 안내
                <Input
                  value={p.allergens}
                  maxLength={400}
                  onChange={(e) => set("allergens", e.target.value)}
                  placeholder="예: 우유, 대두, 밀"
                />
              </label>
              <Button type="button" variant="outline" size="sm" onClick={() => set("allergens", inferred.allergens)}>
                재료 기준으로 자동 입력
              </Button>
            </details>
          </section>
        )}
      </fieldset>
      {error && (
        <div role="alert" className="error">
          {error}
          <Button type="button" variant="outline" size="sm" className="ml-3" disabled={busy} onClick={onRefresh}>
            최신 내용 불러오기
          </Button>
        </div>
      )}
      <div className="form-footer">
        <Button type="button" variant="outline" disabled={busy || uploading} onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={busy || uploading}>
          {busy ? "저장 중…" : "메뉴 저장"}
        </Button>
      </div>
    </form>
  );
}
