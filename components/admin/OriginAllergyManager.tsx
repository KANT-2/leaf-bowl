"use client";
import type { CatalogConfig } from "@/modules/settings/schema";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import SearchField from "@/components/controls/SearchField";
import { Button } from "./button";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";
import { type Catalog, type Ingredient } from "@/modules/catalog/schema";
import { ingredientAllergens, matchesIngredient } from "@/modules/catalog/allergens";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./alert-dialog";

const PAGE_SIZE = 15;

const categoryTone = (value: string) =>
  /채소|과일/.test(value) ? "produce" : /단백질/.test(value) ? "protein" : /토핑/.test(value) ? "topping" : "neutral";

const split = (value: string) =>
  value
    .split(/[,·，、;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);

function PresetInput({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  maxLength: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [popup, setPopup] = useState({ top: 0, left: 0, width: 0, maxHeight: 240 });
  const choices = [...new Set(options.filter(Boolean))];
  useEffect(() => {
    if (!open) {
      return;
    }
    const place = () => {
      const rect = control.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const desired = Math.min(240, (choices.length + 1) * 36 + 8);
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const opensAbove = below < desired && above > below;
      const maxHeight = Math.min(desired, Math.max(64, opensAbove ? above : below), window.innerHeight - 16);
      const width = Math.min(rect.width, window.innerWidth - 16);
      setPopup({
        top: Math.max(8, Math.min(opensAbove ? rect.top - maxHeight - 6 : rect.bottom + 6, window.innerHeight - maxHeight - 8)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight,
      });
    };
    place();
    const closeOutside = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node) && !optionsRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, choices.length]);
  useEffect(() => {
    if (open) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [active, listId, open]);
  const choose = (index: number) => {
    if (index > 0) {
      onChange(choices[index - 1]);
    }
    setOpen(false);
    input.current?.focus();
  };
  return (
    <div className="field origin-preset-field">
      <label htmlFor={id}>{label}</label>
      <div ref={control} className="origin-preset-control" data-state={open ? "open" : "closed"}>
        <Input
          ref={input}
          id={id}
          required={required}
          maxLength={maxLength}
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onFocus={() => { setActive(0); setOpen(true); }}
          onClick={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((current) => Math.max(0, Math.min(choices.length, current + (event.key === "ArrowDown" ? 1 : -1))));
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              choose(active);
            } else if (event.key === "Escape" && open) {
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="origin-preset-trigger"
          aria-label={`${label} 기존 항목 ${open ? "닫기" : "열기"}`}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            if (open) {
              setOpen(false);
            } else {
              setOpen(true);
              input.current?.focus();
            }
          }}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && createPortal(
          <div ref={optionsRef} id={listId} className="origin-preset-options" role="listbox" aria-label={`${label} 기존 항목`} style={popup}>
            {["직접 입력", ...choices].map((choice, index) => (
              <button
                id={`${listId}-${index}`}
                key={index === 0 ? "__custom" : choice}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === 0 ? !choices.includes(value) : choice === value}
                data-active={active === index}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >{choice}</button>
            ))}
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}

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
  const [removing, setRemoving] = useState<Ingredient | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [deleteError, setDeleteError] = useState("");
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
      (p) => !p.deleted && (p.ingredients ?? "").split(/[·,，、;\n]+/).some((t) => matchesIngredient(t, ingredient)),
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
        <SearchField
          className="admin-search admin-search-wide"
          label="원산지 재료 검색"
          placeholder="재료 이름, 원산지 검색"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
        <Select
          value={allergen || "__all"}
          onValueChange={(value) => {
            setAllergen(value === "__all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="origin-allergen-trigger" aria-label="알레르기 필터">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">알레르기 전체</SelectItem>
            <SelectItem value="__none">등록된 안내 없음</SelectItem>
            {allergens.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
          </SelectContent>
        </Select>
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
              <TableHead className="origin-actions-column text-right">관리</TableHead>
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
                  <TableRow className="origin-group-heading" data-tone={categoryTone(group)}>
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
                      <TableCell><span className="origin-category-badge" data-tone={categoryTone(i.category)}>{i.category}</span></TableCell>
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
                          <span className="origin-neutral-label">등록된 안내 없음</span>
                        )}
                      </TableCell>
                      <TableCell>{usedBy(i).length}개</TableCell>
                      <TableCell className="origin-actions-column">
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
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            aria-label={`${i.name} 삭제`}
                            onClick={() => {
                              setDeleteError("");
                              setRemoving(i);
                            }}
                          >
                            <Trash2 size={15} />
                            삭제
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
      {(catalog.ingredients ?? []).some((item) => item.deleted) && (
        <details className="surface ingredient-trash">
          <summary>삭제된 재료 · 복원 ({(catalog.ingredients ?? []).filter((item) => item.deleted).length}개)</summary>
          {(catalog.ingredients ?? [])
            .filter((item) => item.deleted)
            .map((item) => (
              <div className="trash-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <div className="meta">
                    {item.category} · {item.origin || "원산지 미입력"}
                  </div>
                </div>
                <div className="row-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`${item.name} 복원`}
                    onClick={async () => {
                      if (busy) {
                        return;
                      }
                      setRestoreError("");
                      try {
                        await onSave({
                          ...catalog,
                          ingredients: (catalog.ingredients ?? []).map((entry) =>
                            entry.id === item.id ? { ...entry, deleted: false } : entry,
                          ),
                        });
                      } catch (cause) {
                        setRestoreError(
                          cause instanceof Error ? cause.message : "재료를 복원하지 못했습니다. 다시 시도해주세요.",
                        );
                      }
                    }}
                  >
                    복원
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    aria-label={`${item.name} 영구 삭제`}
                    onClick={() => {
                      setDeleteError("");
                      setRemoving(item);
                    }}
                  >
                    영구 삭제
                  </Button>
                </div>
              </div>
            ))}
          {restoreError && (
            <p role="alert" className="error">
              {restoreError}
            </p>
          )}
        </details>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setEditing(null);
          }
        }}
      >
        <DialogContent className="editor-dialog origin-editor-dialog" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>재료 수정</DialogTitle>
            <DialogDescription>저장하면 이 재료를 사용하는 메뉴의 알레르기 안내에 반영됩니다.</DialogDescription>
          </DialogHeader>
          <DialogBody>
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
                    <PresetInput
                      id="origin-category"
                      label="분류"
                      required
                      maxLength={80}
                      value={editing.category}
                      onChange={(value) => setEditing({ ...editing, category: value })}
                      options={config.ingredientCategories}
                    />
                    <PresetInput
                      id="origin-country"
                      label="원산지"
                      maxLength={100}
                      value={editing.origin ?? ""}
                      onChange={(value) => setEditing({ ...editing, origin: value })}
                      options={config.originCountries}
                      placeholder="예: 국내산, 미국산"
                    />
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
          </DialogBody>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRemoving(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.deleted ? "재료를 영구 삭제할까요?" : "재료를 삭제할까요?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.deleted
                ? `${removing.name}을 저장된 재료 목록에서 완전히 삭제합니다. 영구 삭제하면 복원할 수 없습니다.`
                : `${removing?.name}을 원산지 및 알레르기 관리와 bowl match 목록에서 삭제합니다. 이 페이지 아래의 삭제된 재료 목록에서 복원할 수 있습니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="error">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!removing || busy) {
                  return;
                }
                setDeleteError("");
                try {
                  await onSave({
                    ...catalog,
                    ingredients: removing.deleted
                      ? (catalog.ingredients ?? []).filter((item) => item.id !== removing.id)
                      : (catalog.ingredients ?? []).map((item) =>
                          item.id === removing.id ? { ...item, deleted: true } : item,
                        ),
                  });
                  setRemoving(null);
                } catch (cause) {
                  setDeleteError(
                    cause instanceof Error ? cause.message : "재료를 삭제하지 못했습니다. 다시 시도해주세요.",
                  );
                }
              }}
            >
              {busy ? "삭제 중…" : removing?.deleted ? "영구 삭제" : "삭제"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
