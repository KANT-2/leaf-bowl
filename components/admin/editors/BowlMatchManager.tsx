"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/admin/alert-dialog";
import { Button } from "@/components/admin/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/admin/dialog";
import { Input } from "@/components/admin/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/admin/table";
import { type Catalog, type Ingredient } from "@/modules/catalog/schema";
import { GripVertical, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Photo, Picker } from "./EditorFields";

export default function BowlMatchManager({
  catalog,
  busy,
  onSave,
}: {
  catalog: Catalog;
  busy: boolean;
  onSave: (c: Catalog) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Ingredient | null>(null),
    [removing, setRemoving] = useState<Ingredient | null>(null),
    [error, setError] = useState(""),
    [choosing, setChoosing] = useState(false),
    [search, setSearch] = useState(""),
    [categoryFilter, setCategoryFilter] = useState(""),
    [dragged, setDragged] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);
  const drag = useRef<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const savedItems = catalog.ingredients || [];
  const items = order
    ? [...savedItems].sort((a, b) => {
        const ai = order.indexOf(a.id),
          bi = order.indexOf(b.id);
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      })
    : savedItems;
  const visible = items.filter((i) => !i.deleted);
  const categories = [...new Set(visible.map((item) => item.category))];
  const labels = { active: "노출", soldout: "품절", hidden: "숨김" };
  async function persist(next: Ingredient[]) {
    setError("");
    try {
      await onSave({ ...catalog, ingredients: next });
      setOrder(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  async function reorder(from: string, to: string) {
    if (busy || from === to) {
      return;
    }
    const next = [...items],
      a = next.findIndex((i) => i.id === from),
      b = next.findIndex((i) => i.id === to);
    if (a < 0 || b < 0) {
      return;
    }
    if (next[a].category !== next[b].category) {
      return;
    }
    const categorySlots = next
      .map((item, index) => (!item.deleted && item.category === next[a].category ? index : -1))
      .filter((index) => index >= 0);
    const group = categorySlots.map((index) => next[index]);
    const fromIndex = group.findIndex((item) => item.id === from),
      toIndex = group.findIndex((item) => item.id === to);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const [moved] = group.splice(fromIndex, 1);
    group.splice(toIndex, 0, moved);
    categorySlots.forEach((slot, index) => {
      next[slot] = group[index];
    });
    setOrder(next.map((item) => item.id));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE YOUR OWN BOWL</div>
          <h1>bowl match 관리</h1>
          <p className="muted">재료를 드래그해 같은 분류 안에서 순서를 변경하세요.</p>
        </div>
        <div className="bowl-heading-actions">
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              setEditing(null);
              setSearch("");
              setCategoryFilter("");
              setChoosing(true);
            }}
          >
            <Plus size={18} />
            재료 등록하기
          </Button>
          <Button
            variant="outline"
            disabled={busy || !order}
            onClick={async () => {
              if (await persist(items)) {
                toast.success("재료 순서를 저장했습니다.");
              }
            }}
          >
            순서 저장
          </Button>
        </div>
      </div>
      <div className="bowl-reorder-note" role="status">
        <Info size={18} aria-hidden="true" />
        같은 분류 안에서만 이동할 수 있어요. 다른 분류로는 이동되지 않습니다.
        {order && <strong>변경한 순서를 저장해주세요.</strong>}
      </div>
      {categories.map((category) => {
        const categoryItems = visible.filter((item) => item.category === category);
        return (
          <section key={category} className="surface menu-table bowl-category-table">
            <div className="bowl-category-heading">
              <h2>{category}</h2>
              <span>{categoryItems.length}개</span>
              <p className="meta">분류 내 순서 변경</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>순서</TableHead>
                  <TableHead>재료</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryItems.map((item, index) => (
                  <TableRow
                    key={item.id}
                    draggable={!busy}
                    className={
                      "ingredient-drag-row" +
                      (dragged === item.id ? " dragging" : "") +
                      (over === item.id && dragged !== item.id ? " drag-over" : "")
                    }
                    tabIndex={0}
                    aria-label={item.name + " 재료, 드래그 또는 Alt와 위아래 방향키로 순서 변경"}
                    onDragStart={(e) => {
                      if (busy || (e.target as HTMLElement).closest("button")) {
                        e.preventDefault();
                        return;
                      }
                      drag.current = item.id;
                      setDragged(item.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", item.id);
                    }}
                    onDragOver={(e) => {
                      if (
                        !drag.current ||
                        busy ||
                        items.find((item) => item.id === drag.current)?.category !== category
                      ) {
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setOver(item.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = drag.current;
                      drag.current = null;
                      setDragged(null);
                      setOver(null);
                      if (from) {
                        void reorder(from, item.id);
                      }
                    }}
                    onDragEnd={() => {
                      drag.current = null;
                      setDragged(null);
                      setOver(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || !e.altKey || busy) {
                        return;
                      }
                      const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                      if (step && categoryItems[index + step]) {
                        e.preventDefault();
                        void reorder(item.id, categoryItems[index + step].id);
                      }
                    }}
                  >
                    <TableCell>
                      <GripVertical className="bowl-drag-handle" size={20} aria-hidden="true" />
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="product-cell">
                        <Photo src={item.image} name={item.name} />
                        <div>
                          <strong>{item.name}</strong>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={"status-tag " + item.status}>{labels[item.status]}</span>
                    </TableCell>
                    <TableCell>
                      <div className="row-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setEditing(structuredClone(item));
                          }}
                        >
                          <Pencil size={14} />
                          수정
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={item.name + " 재료 삭제"}
                          disabled={busy}
                          onClick={() => setRemoving(item)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}
      {!visible.length && (
        <div className="surface empty">등록된 재료가 없습니다. 재료 등록하기 버튼으로 재료를 선택해주세요.</div>
      )}
      {items.some((i) => i.deleted) && (
        <details className="surface ingredient-trash">
          <summary>삭제된 재료 · 복원</summary>
          {items
            .filter((i) => i.deleted)
            .map((i) => (
              <div className="trash-row" key={i.id}>
                <span>{i.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => persist(items.map((x) => (x.id === i.id ? { ...x, deleted: false } : x)))}
                >
                  복원
                </Button>
              </div>
            ))}
        </details>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Dialog
        open={choosing || !!editing}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setEditing(null);
            setChoosing(false);
          }
        }}
      >
        <DialogContent
          className="editor-dialog"
          closeDisabled={busy || uploading}
          onEscapeKeyDown={(e) => {
            if (busy || uploading) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{choosing ? "재료 등록하기" : "bowl match 재료 설정"}</DialogTitle>
            <DialogDescription>
              원산지 및 알레르기 관리에 저장된 재료를 사용합니다. 여기서는 가격·선택 단계·노출 상태를 설정하세요.
            </DialogDescription>
          </DialogHeader>
          <ol className="bowl-registration-steps" aria-label="재료 등록 단계">
            <li aria-current={choosing ? "step" : undefined}>
              <span>1</span> 재료 선택
            </li>
            <li aria-current={!choosing ? "step" : undefined}>
              <span>2</span> 표시 설정
            </li>
          </ol>
          {choosing && (
            <div className="bowl-registration-selection">
              <label className="field">
                등록 재료 선택
                <Input
                  value={search}
                  disabled={busy}
                  placeholder="재료 이름으로 검색하세요"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="bowl-registration-filters" aria-label="재료 분류">
                {["", ...categories].map((category) => (
                  <Button
                    key={category}
                    type="button"
                    variant={categoryFilter === category ? "default" : "outline"}
                    disabled={busy}
                    aria-pressed={categoryFilter === category}
                    onClick={() => setCategoryFilter(category)}
                  >
                    {category || "전체"}
                  </Button>
                ))}
              </div>
              <p className="meta">
                {categoryFilter || "전체"}{" "}
                {
                  visible.filter(
                    (item) =>
                      (!categoryFilter || item.category === categoryFilter) &&
                      item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
                  ).length
                }
                개
              </p>
              <div className="bowl-registration-cards" role="radiogroup" aria-label="등록 재료 선택">
                {visible
                  .filter(
                    (item) =>
                      (!categoryFilter || item.category === categoryFilter) &&
                      item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
                  )
                  .map((item) => (
                    <label
                      key={item.id}
                      className={"bowl-registration-card" + (editing?.id === item.id ? " selected" : "")}
                    >
                      <Photo src={item.image} name={item.name} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.category}</small>
                      </span>
                      <input
                        type="radio"
                        name="bowl-registered-ingredient"
                        value={item.id}
                        checked={editing?.id === item.id}
                        disabled={busy}
                        onChange={() =>
                          setEditing(
                            editing?.id === item.id
                              ? editing
                              : { ...item, status: item.status === "hidden" ? "active" : item.status },
                          )
                        }
                      />
                    </label>
                  ))}
              </div>
              {!visible.some(
                (item) =>
                  (!categoryFilter || item.category === categoryFilter) &&
                  item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
              ) && <p className="empty">조건에 맞는 재료가 없습니다.</p>}
              <div className="bowl-registration-summary" aria-live="polite">
                <strong>선택한 재료</strong>
                {editing ? (
                  <>
                    <Photo src={editing.image} name={editing.name} />
                    <span>{editing.name}</span>
                    <small>{editing.category}</small>
                  </>
                ) : (
                  <span>재료를 선택해주세요</span>
                )}
              </div>
              <div className="form-footer bowl-registration-footer">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setChoosing(false);
                    setEditing(null);
                    window.location.hash = "origins";
                  }}
                >
                  재료가 없나요? 재료 관리에서 등록 ›
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setChoosing(false);
                    setEditing(null);
                  }}
                >
                  취소
                </Button>
                <Button type="button" disabled={busy || !editing} onClick={() => setChoosing(false)}>
                  다음: 표시 설정 ›
                </Button>
              </div>
            </div>
          )}
          {editing && !choosing && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy || uploading) {
                  return;
                }
                const source = items.find((item) => item.id === editing.id && !item.deleted);
                if (!source) {
                  setError("등록 재료가 변경되었습니다. 목록을 다시 확인해주세요.");
                  return;
                }
                if (
                  await persist(
                    items.map((item) =>
                      item.id === source.id
                        ? {
                            ...item,
                            price: editing.price ?? 0,
                            stage: editing.stage ?? "TOPPINGS",
                            status: editing.status,
                          }
                        : item,
                    ),
                  )
                ) {
                  setEditing(null);
                  setChoosing(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <div>
                    <div className="field">
                      <strong>{editing.name}</strong>
                      <p className="meta">분류: {editing.category}</p>
                      <p className="meta">
                        원산지: {editing.origin || "미입력"}
                        {editing.originDetail ? ` · ${editing.originDetail}` : ""}
                      </p>
                      <p className="meta">알레르기: {editing.allergens || "등록된 안내 없음"}</p>
                    </div>
                    <label className="field">
                      추가 가격
                      <Input
                        type="number"
                        min={0}
                        max={1000000}
                        value={editing.price ?? 0}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            price: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      선택 단계
                      <Picker
                        label="재료 선택 단계"
                        value={editing.stage ?? "TOPPINGS"}
                        options={[
                          ["GREENS", "채소"],
                          ["PROTEIN", "단백질"],
                          ["VEGGIES", "추가 채소"],
                          ["TOPPINGS", "토핑"],
                        ]}
                        onChange={(v) =>
                          setEditing({
                            ...editing,
                            stage: v as Ingredient["stage"],
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      카드 상태
                      <Picker
                        label="재료 카드 상태"
                        value={editing.status}
                        options={Object.entries(labels)}
                        onChange={(v) =>
                          setEditing({
                            ...editing,
                            status: v as Ingredient["status"],
                          })
                        }
                      />
                    </label>
                  </div>
                  <div>
                    <div className="field">
                      등록된 재료 이미지
                      <Photo src={editing.image} name={editing.name} className="upload-photo" />
                    </div>
                    <div className="field">
                      등록된 재료 설명<p className="muted">{editing.description || "등록된 설명 없음"}</p>
                    </div>
                  </div>
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="form-footer">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setChoosing(true)}>
                  ‹ 이전: 재료 선택
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    setChoosing(false);
                  }}
                >
                  취소
                </Button>
                <Button type="submit" disabled={busy}>
                  설정 저장
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!removing}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setRemoving(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>재료를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.name}을 삭제합니다. bowl match와 원산지 및 알레르기 관리 목록에서 제외되며, 휴지통에서 복원할
              수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (
                  removing &&
                  (await persist(items.map((i) => (i.id === removing.id ? { ...i, deleted: true } : i))))
                ) {
                  setRemoving(null);
                }
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
