"use client";
import { Button } from "@/components/admin/button";
import { Checkbox } from "@/components/admin/checkbox";
import { Input } from "@/components/admin/input";
import { Textarea } from "@/components/admin/textarea";
import { ingredientAllergens } from "@/lib/admin/allergens";
import {
  type Catalog,
  type OptionGroup,
  type Product,
} from "@/lib/admin/catalog";
import { statusNames } from "@/lib/admin/editor-helpers";
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
}: {
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
  const inferred = ingredientAllergens(p.ingredients ?? "", ingredients);
  const updateIngredients = (value: string) =>
    setP((x) => ({
      ...x,
      ingredients: value,
      allergens: ingredientAllergens(value, ingredients).allergens,
    }));
  const set = <K extends keyof Product>(key: K, value: Product[K]) =>
    setP((x) => ({ ...x, [key]: value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave({
            ...p,
            optionIds: p.optionIds.filter((id) =>
              groups.some((g) => g.id === id),
            ),
          });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <fieldset disabled={busy || uploading}>
        <div className="form-grid">
          <div>
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
                options={["", "BEST", "NEW", "PLANT", "PICK"].map((v) => [
                  v,
                  v || "배지 없음",
                ])}
              />
            </label>
          </div>
          <div>
            <div className="field">
              메뉴 이미지
              <Upload
                value={p.image}
                onChange={(v) => set("image", v)}
                onBusy={setUploading}
              />
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
            {p.type === "salad" && (
              <>
                <label className="field">
                  영문 이름
                  <Input
                    maxLength={100}
                    value={p.en ?? ""}
                    onChange={(e) => set("en", e.target.value)}
                  />
                </label>
                <label className="field">
                  구성 재료
                  <Textarea
                    maxLength={600}
                    value={p.ingredients ?? ""}
                    onChange={(e) => updateIngredients(e.target.value)}
                  />
                </label>
              </>
            )}
            {p.type === "salad" && (
              <div className="field">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => set("allergens", inferred.allergens)}
                >
                  재료 기준으로 자동 입력
                </Button>
                <p className="meta">
                  구성 재료 변경 시 등록된 재료의 안내를 자동 입력하며 직접
                  보완할 수 있습니다.
                </p>
                {inferred.unknown.length > 0 && (
                  <p className="meta" role="status">
                    등록된 재료와 일치하지 않아 확인이 필요합니다:{" "}
                    {inferred.unknown.join(", ")}
                  </p>
                )}
              </div>
            )}
            <label className="field">
              알레르기 안내
              <Input
                value={p.allergens}
                maxLength={400}
                onChange={(e) => set("allergens", e.target.value)}
                placeholder="예: 우유, 대두, 밀"
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
                        set(
                          "optionIds",
                          v
                            ? [...p.optionIds, g.id]
                            : p.optionIds.filter((x) => x !== g.id),
                        )
                      }
                    />
                    {g.name}
                  </label>
                ))}
                {!groups.length && (
                  <div className="meta">
                    옵션 관리에서 그룹을 먼저 등록해주세요.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </fieldset>
      {error && (
        <div role="alert" className="error">
          {error}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-3"
            disabled={busy}
            onClick={onRefresh}
          >
            최신 내용 불러오기
          </Button>
        </div>
      )}
      <div className="form-footer">
        <Button
          type="button"
          variant="outline"
          disabled={busy || uploading}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button type="submit" disabled={busy || uploading}>
          {busy ? "저장 중…" : "메뉴 저장"}
        </Button>
      </div>
    </form>
  );
}
