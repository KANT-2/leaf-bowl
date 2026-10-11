"use client";
import { Button } from "@/components/admin/button";
import { Input } from "@/components/admin/input";
import { saladCategories, type Catalog } from "@/lib/admin/catalog";
import { useRef, useState } from "react";
import { Picker } from "./EditorFields";

export default function CategoryManager({
  catalog,
  busy,
  onSave,
}: {
  catalog: Catalog;
  busy: boolean;
  onSave: (c: Catalog, successMessage?: string) => Promise<void>;
}) {
  const dragging = useRef<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);
  async function reorder(from: string, to: string) {
    if (busy || from === to) return;
    const list = [...saladCategories(catalog)];
    const start = list.indexOf(from),
      end = list.indexOf(to);
    if (start < 0 || end < 0) return;
    list.splice(start, 1);
    list.splice(end, 0, from);
    setError("");
    try {
      await onSave(
        { ...catalog, categories: list },
        "카테고리 순서를 저장했습니다.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [removing, setRemoving] = useState<string | null>(null),
    [target, setTarget] = useState(""),
    [error, setError] = useState("");
  const categories = saladCategories(catalog);
  async function saveName() {
    const value = name.trim();
    if (!value) {
      setError("카테고리 이름을 입력해주세요.");
      return;
    }
    if (categories.some((x) => x === value && x !== editing)) {
      setError("이미 등록된 카테고리입니다.");
      return;
    }
    try {
      await onSave({
        ...catalog,
        categories: editing
          ? categories.map((x) => (x === editing ? value : x))
          : [...categories, value],
        products: editing
          ? catalog.products.map((p) =>
              p.type === "salad" && p.category === editing
                ? { ...p, category: value }
                : p,
            )
          : catalog.products,
      });
      setEditing(null);
      setName("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="surface category-manager">
      <div className="section-heading">
        <div>
          <h2>샐러드 카테고리</h2>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(!open)}>
          {open ? "관리 닫기" : "카테고리 관리"}
        </Button>
      </div>
      {open && (
        <fieldset disabled={busy}>
          <div className="category-list">
            {categories.map((category, i) => (
              <div
                key={category}
                className={
                  "category-drag-row" +
                  (dragged === category ? " dragging" : "") +
                  (over === category && dragged !== category
                    ? " drag-over"
                    : "")
                }
                draggable={!busy}
                tabIndex={0}
                aria-label={
                  category +
                  " 카테고리, 드래그하여 순서 변경. Alt와 위아래 방향키로도 이동 가능"
                }
                onDragStart={(e) => {
                  if (busy || (e.target as HTMLElement).closest("button")) {
                    e.preventDefault();
                    return;
                  }
                  dragging.current = category;
                  setDragged(category);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", category);
                }}
                onDragOver={(e) => {
                  if (busy || !dragging.current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOver(category);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragging.current;
                  dragging.current = null;
                  setDragged(null);
                  setOver(null);
                  if (from) void reorder(from, category);
                }}
                onDragEnd={() => {
                  dragging.current = null;
                  setDragged(null);
                  setOver(null);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || !e.altKey || busy) return;
                  const delta =
                    e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                  if (!delta) return;
                  e.preventDefault();
                  if (categories[i + delta])
                    void reorder(category, categories[i + delta]);
                }}
              >
                <span className="category-grip" aria-hidden="true">
                  ⠿
                </span>
                <strong>{category}</strong>
                <span className="meta">
                  {
                    catalog.products.filter(
                      (p) =>
                        p.type === "salad" &&
                        !p.deleted &&
                        p.category === category,
                    ).length
                  }
                  개 메뉴
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setEditing(category);
                    setName(category);
                    setError("");
                  }}
                >
                  이름 변경
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={categories.length === 1}
                  onClick={() => {
                    setRemoving(category);
                    setTarget(categories.find((x) => x !== category) || "");
                    setError("");
                  }}
                >
                  삭제
                </Button>
              </div>
            ))}
          </div>
          <div className="category-name-form">
            <Input
              aria-label="카테고리 이름"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 가벼운 한 끼"
            />
            <Button
              type="button"
              disabled={categories.length >= 30 && !editing}
              onClick={saveName}
            >
              {editing ? "이름 저장" : "카테고리 추가"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setName("");
                }}
              >
                취소
              </Button>
            )}
          </div>
          {removing && (
            <div className="category-delete">
              <p>
                <strong>{removing}</strong> 삭제 후 해당 메뉴를 옮길 카테고리를
                선택해주세요.
              </p>
              <Picker
                label="삭제 후 이동할 카테고리"
                value={target}
                onChange={setTarget}
                options={categories
                  .filter((x) => x !== removing)
                  .map((x) => [x, x])}
              />
              <div className="row-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRemoving(null)}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await onSave({
                        ...catalog,
                        categories: categories.filter((x) => x !== removing),
                        products: catalog.products.map((p) =>
                          p.type === "salad" && p.category === removing
                            ? { ...p, category: target }
                            : p,
                        ),
                      });
                      setRemoving(null);
                      setEditing(null);
                      setName("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  삭제 및 메뉴 이동
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </fieldset>
      )}
    </section>
  );
}
