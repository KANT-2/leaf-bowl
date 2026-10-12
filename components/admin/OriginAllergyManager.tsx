"use client";
import type { CatalogConfig } from "@/modules/settings/schema";

import { Fragment, useState } from "react";
import { Plus, Pencil, Search } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";
import { type Catalog, type Ingredient } from "@/modules/catalog/schema";
import { ingredientAllergens, matchesIngredient } from "@/modules/catalog/allergens";

const PAGE_SIZE = 15;
const split = (value: string) =>
  value
    .split(/[,·，、;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export default function OriginAllergyManager({
  catalog,
  config,
  busy,
  onSave,
}: {
  catalog: Catalog;
  config: CatalogConfig;
  busy: boolean;
  onSave: (catalog: Catalog) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [allergen, setAllergen] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const ingredients = (catalog.ingredients ?? []).filter((i) => !i.deleted);
  const categories = [...new Set(ingredients.map((ingredient) => ingredient.category))];
  const allergens = [...new Set(ingredients.flatMap((ingredient) => split(ingredient.allergens)))];
  const filteredIngredients = categories.flatMap((group) =>
    ingredients.filter(
      (ingredient) =>
        ingredient.category === group &&
        (!category || ingredient.category === category) &&
        (!allergen ||
          (allergen === "__none"
            ? !split(ingredient.allergens).length
            : split(ingredient.allergens).includes(allergen))) &&
        [ingredient.name, ingredient.origin ?? "", ingredient.originDetail ?? ""].some((text) =>
          text.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    ),
  );
  const pageCount = Math.max(1, Math.ceil(filteredIngredients.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedIngredients = filteredIngredients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const usedBy = (ingredient: Ingredient) =>
    catalog.products.filter(
      (p) =>
        !p.deleted &&
        p.type === "salad" &&
        (p.ingredients ?? "").split(/[·,，、;\n]+/).some((t) => matchesIngredient(t, ingredient)),
    );

  const open = (ingredient: Ingredient) => {
    setEditing(structuredClone(ingredient));
    setShowAll(false);
    setError("");
  };

  async function save() {
    if (!editing || busy) {
      return;
    }
    setError("");
    try {
      const previous = (catalog.ingredients ?? []).find((i) => i.id === editing.id);
      const nextIngredients = previous
        ? (catalog.ingredients ?? []).map((i) => (i.id === editing.id ? editing : i))
        : [...(catalog.ingredients ?? []), editing];
      const products = catalog.products.map((p) => {
        if (
          p.deleted ||
          p.type !== "salad" ||
          !(p.ingredients ?? "").split(/[·,，、;\n]+/).some((t) => matchesIngredient(t, previous ?? editing))
        ) {
          return p;
        }
        // Keep manual supplements; replace only allergens previously supplied by ingredients.
        const oldAuto = split(ingredientAllergens(p.ingredients ?? "", catalog.ingredients ?? []).allergens);
        const extras = split(p.allergens).filter((x) => !oldAuto.includes(x));
        const newText = (p.ingredients ?? "")
          .split(/([·,，、;\n])/)
          .map((t) => (previous && matchesIngredient(t, previous) ? editing.name : t))
          .join("");
        const inferred = split(ingredientAllergens(newText, nextIngredients).allergens);
        return {
          ...p,
          ingredients: newText,
          allergens: [...new Set([...inferred, ...extras])].join(", "),
        };
      });
      await onSave({ ...catalog, ingredients: nextIngredients, products });
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INGREDIENT INFORMATION</div>
          <h1>원산지 및 알레르기 관리</h1>
          <p className="muted">재료별 원산지와 알레르기 안내를 관리하세요.</p>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            open({
              id: crypto.randomUUID(),
              name: "",
              category: config.ingredientCategories[0],
              origin: "",
              originDetail: "",
              allergens: "",
              description: "",
              image: "",
              status: "hidden",
              deleted: false,
            })
          }
        >
          <Plus size={18} />
          재료 추가
        </Button>
      </div>
      <div className="origin-category-tabs" role="group" aria-label="재료 분류 필터">
        {["", ...categories].map((value) => (
          <Button
            key={value}
            variant={category === value ? "default" : "outline"}
            aria-pressed={category === value}
            onClick={() => {
              setCategory(value);
              setPage(1);
            }}
          >
            {value || "전체"}
            <span>
              {value ? ingredients.filter((ingredient) => ingredient.category === value).length : ingredients.length}
            </span>
          </Button>
        ))}
      </div>
      <div className="origin-filters">
        <div className="origin-search">
          <Search size={18} aria-hidden="true" />
          <Input
            aria-label="원산지 재료 검색"
            placeholder="재료 이름, 원산지 검색"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="알레르기 필터"
          value={allergen}
          onChange={(e) => {
            setAllergen(e.target.value);
            setPage(1);
          }}
        >
          <option value="">알레르기 전체</option>
          <option value="__none">등록된 안내 없음</option>
          {allergens.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <p className="origin-result-count" role="status">
        {category || "전체"} 재료 {filteredIngredients.length}개
      </p>
      <section className="surface menu-table origin-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>재료</TableHead>
              <TableHead>분류</TableHead>
              <TableHead>원산지</TableHead>
              <TableHead>알레르기</TableHead>
              <TableHead>사용 중인 메뉴</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((group) => {
              const rows = pagedIngredients.filter((ingredient) => ingredient.category === group);
              if (!rows.length) {
                return null;
              }
              return (
                <Fragment key={group}>
                  <TableRow className="origin-group-heading">
                    <TableCell colSpan={6}>
                      <strong>{group}</strong>
                      <span>{filteredIngredients.filter((ingredient) => ingredient.category === group).length}</span>
                    </TableCell>
                  </TableRow>
                  {rows.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <strong>{i.name}</strong>
                      </TableCell>
                      <TableCell>{i.category}</TableCell>
                      <TableCell>
                        {i.origin || "미입력"}
                        {i.originDetail && <div className="meta">{i.originDetail}</div>}
                      </TableCell>
                      <TableCell>
                        {split(i.allergens).length ? (
                          <div className="origin-allergen-tags">
                            {split(i.allergens).map((value) => (
                              <span key={value}>{value}</span>
                            ))}
                          </div>
                        ) : (
                          "등록된 안내 없음"
                        )}
                      </TableCell>
                      <TableCell>{usedBy(i).length}개</TableCell>
                      <TableCell>
                        <div className="row-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            aria-label={`${i.name} 수정`}
                            onClick={() => open(i)}
                          >
                            <Pencil size={15} />
                            수정
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {!filteredIngredients.length && (
          <p className="empty">{query || category || allergen ? "검색 결과가 없습니다." : "등록된 재료가 없습니다."}</p>
        )}
      </section>
      {filteredIngredients.length > 0 && (
        <div className="menu-pagination">
          <nav aria-label="원산지 및 알레르기 재료 목록 페이지">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              이전
            </Button>
            {Array.from({ length: pageCount }, (_, i) => (
              <Button
                key={i}
                type="button"
                variant={currentPage === i + 1 ? "default" : "outline"}
                size="sm"
                aria-label={i + 1 + "페이지"}
                aria-current={currentPage === i + 1 ? "page" : undefined}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              다음
            </Button>
          </nav>
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setEditing(null);
          }
        }}
      >
        <DialogContent className="editor-dialog" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>재료 수정</DialogTitle>
            <DialogDescription>저장하면 이 재료를 사용하는 메뉴의 알레르기 안내에 반영됩니다.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <label className="field">
                    재료 이름
                    <Input
                      required
                      maxLength={80}
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    분류
                    <Input
                      required
                      maxLength={80}
                      list="origin-categories"
                      value={editing.category}
                      onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    />
                    <datalist id="origin-categories">
                      {config.ingredientCategories.map((x) => (
                        <option key={x} value={x} />
                      ))}
                    </datalist>
                  </label>
                  <label className="field">
                    원산지
                    <Input
                      maxLength={100}
                      list="origin-countries"
                      value={editing.origin ?? ""}
                      onChange={(e) => setEditing({ ...editing, origin: e.target.value })}
                      placeholder="예: 국내산, 미국산"
                    />
                    <datalist id="origin-countries">
                      {config.originCountries.map((x) => (
                        <option key={x} value={x} />
                      ))}
                    </datalist>
                  </label>
                  <label className="field">
                    원산지 상세 (선택)
                    <Input
                      maxLength={300}
                      value={editing.originDetail ?? ""}
                      onChange={(e) => setEditing({ ...editing, originDetail: e.target.value })}
                      placeholder="예: 콩 미국산, 흰다리새우"
                    />
                  </label>
                </div>
                <fieldset className="field">
                  <legend>알레르기</legend>
                  <div className="allergen-options">
                    {[
                      ...new Set([
                        ...(showAll ? config.allergenOptions : config.allergenOptions.slice(0, 5)),
                        ...split(editing.allergens),
                      ]),
                    ].map((value) => (
                      <Button
                        type="button"
                        key={value}
                        variant={split(editing.allergens).includes(value) ? "default" : "outline"}
                        aria-pressed={split(editing.allergens).includes(value)}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            allergens: split(editing.allergens).includes(value)
                              ? split(editing.allergens)
                                  .filter((x) => x !== value)
                                  .join(", ")
                              : [...split(editing.allergens), value].join(", "),
                          })
                        }
                      >
                        {value}
                        {split(editing.allergens).includes(value) ? " ✓" : ""}
                      </Button>
                    ))}
                    {config.allergenOptions.length > 5 && (
                      <Button type="button" variant="ghost" onClick={() => setShowAll(!showAll)}>
                        {showAll ? "접기" : `+ ${config.allergenOptions.length - 5}개 더보기`}
                      </Button>
                    )}
                  </div>
                </fieldset>
                <p className="meta">
                  사용 중인 메뉴:{" "}
                  {usedBy(editing)
                    .map((p) => p.name)
                    .join(" · ") || "없음"}
                </p>
              </fieldset>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-footer">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>
                  취소
                </Button>
                <Button disabled={busy} type="submit">
                  {busy ? "저장 중…" : "저장"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
