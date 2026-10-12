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
import { Textarea } from "@/components/admin/textarea";
import { type Catalog, type Ingredient } from "@/modules/catalog/schema";
import { uid } from "@/features/admin/editor-helpers";
import { GripVertical, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Photo, Picker, Upload } from "./EditorFields";

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
    [uploading, setUploading] = useState(false),
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
              setEditing({
                id: uid(),
                name: "",
                description: "",
                category: "채소",
                image: "",
                allergens: "",
                status: "active",
                deleted: false,
              });
            }}
          >
            <Plus size={18} />
            재료 추가
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
        <div className="surface empty">등록된 재료가 없습니다. 재료 추가 버튼으로 첫 카드를 등록해주세요.</div>
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
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !busy && !uploading) {
            setEditing(null);
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
            <DialogTitle>{items.some((i) => i.id === editing?.id) ? "재료 수정" : "재료 추가"}</DialogTitle>
            <DialogDescription>재료 정보와 카드 노출 상태를 설정하세요.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy || uploading) {
                  return;
                }
                if (
                  await persist(
                    items.some((i) => i.id === editing.id)
                      ? items.map((i) => (i.id === editing.id ? editing : i))
                      : [...items, editing],
                  )
                ) {
                  setEditing(null);
                }
              }}
            >
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <div>
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
                      분류
                      <Input
                        required
                        maxLength={80}
                        value={editing.category}
                        placeholder="채소 · 단백질 · 토핑"
                        onChange={(e) => setEditing({ ...editing, category: e.target.value })}
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
                    <label className="field">
                      알레르기 안내
                      <Input
                        maxLength={400}
                        value={editing.allergens}
                        onChange={(e) => setEditing({ ...editing, allergens: e.target.value })}
                      />
                    </label>
                  </div>
                  <div>
                    <div className="field">
                      재료 이미지
                      <Upload
                        value={editing.image}
                        onBusy={setUploading}
                        onChange={(image) => setEditing({ ...editing, image })}
                      />
                    </div>
                    <label className="field">
                      재료 설명
                      <Textarea
                        maxLength={600}
                        value={editing.description}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            description: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="form-footer">
                <Button type="button" variant="outline" disabled={busy || uploading} onClick={() => setEditing(null)}>
                  취소
                </Button>
                <Button type="submit" disabled={busy || uploading}>
                  재료 저장
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
              {removing?.name}을 목록에서 제외합니다. 삭제된 재료에서 복원할 수 있습니다.
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
