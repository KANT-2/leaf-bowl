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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/admin/dialog";
import { saladCategories, type Catalog } from "@/lib/admin/catalog";
import GroupForm from "./editors/GroupForm";
import ProductForm from "./editors/ProductForm";
import type { CatalogEditors } from "./use-catalog-editors";
export default function CatalogDialogs({
  catalog,
  busy,
  editors,
  load,
  save,
  action,
}: {
  catalog: Catalog;
  busy: boolean;
  editors: CatalogEditors;
  load: () => Promise<void>;
  save: (catalog: Catalog, message?: string) => Promise<void>;
  action: (fn: () => Promise<void>) => Promise<void>;
}) {
  const {
    product,
    setProduct,
    group,
    setGroup,
    deleting,
    setDeleting,
    purging,
    setPurging,
    preview,
    setPreview,
  } = editors;
  return (
    <>
      <Dialog
        open={!!product}
        onOpenChange={(v) => {
          if (!busy && !v) setProduct(null);
        }}
      >
        <DialogContent
          className="editor-dialog"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {product && catalog.products.some((p) => p.id === product.id)
                ? "메뉴 수정"
                : "새 메뉴 등록"}
            </DialogTitle>
            <DialogDescription>
              저장한 메뉴는 고객 미리보기에 바로 반영됩니다.
            </DialogDescription>
          </DialogHeader>
          {product && (
            <ProductForm
              key={product.id}
              initial={product}
              ingredients={catalog.ingredients ?? []}
              categories={saladCategories(catalog)}
              groups={catalog.groups.filter((g) => !g.deleted)}
              busy={busy}
              onRefresh={load}
              onCancel={() => setProduct(null)}
              onSave={async (p) => {
                await save({
                  ...catalog,
                  products: catalog.products.some((x) => x.id === p.id)
                    ? catalog.products.map((x) => (x.id === p.id ? p : x))
                    : [...catalog.products, p],
                });
                setProduct(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!group}
        onOpenChange={(v) => {
          if (!busy && !v) setGroup(null);
        }}
      >
        <DialogContent
          className="editor-dialog"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>옵션 그룹 설정</DialogTitle>
            <DialogDescription>
              선택 방식과 항목별 추가 금액을 설정합니다.
            </DialogDescription>
          </DialogHeader>
          {group && (
            <GroupForm
              key={group.id}
              initial={group}
              busy={busy}
              onRefresh={load}
              onCancel={() => setGroup(null)}
              onSave={async (g, connectAll) => {
                await save({
                  ...catalog,
                  products: connectAll
                    ? catalog.products.map((p) =>
                        p.type === "salad" && !p.deleted
                          ? {
                              ...p,
                              optionIds: [...new Set([...p.optionIds, g.id])],
                            }
                          : p,
                      )
                    : catalog.products,
                  groups: catalog.groups.some((x) => x.id === g.id)
                    ? catalog.groups.map((x) => (x.id === g.id ? g : x))
                    : [...catalog.groups, g],
                });
                setGroup(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              “{deleting?.name}”을 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === "group"
                ? "연결된 메뉴에서 이 옵션이 제거됩니다."
                : "고객 미리보기에서 이 메뉴가 제거됩니다."}{" "}
              삭제 후 휴지통에서 복원할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                action(async () => {
                  if (!deleting) return;
                  const next = structuredClone(catalog);
                  if (deleting.kind === "product") {
                    next.products.find((p) => p.id === deleting.id)!.deleted =
                      true;
                    if (next.content.seasonProductId === deleting.id)
                      next.content.seasonProductId = "";
                  } else {
                    next.groups.find((g) => g.id === deleting.id)!.deleted =
                      true;
                    next.products.forEach(
                      (p) =>
                        (p.optionIds = p.optionIds.filter(
                          (id) => id !== deleting.id,
                        )),
                    );
                  }
                  await save(next);
                  setDeleting(null);
                });
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!purging}
        onOpenChange={(v) => {
          if (!v && !busy) setPurging(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              “{purging?.name}”을 영구 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              영구 삭제하면 복원할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  if (!purging) return;
                  const next = structuredClone(catalog);
                  if (purging.kind === "product") {
                    next.products = next.products.filter(
                      (p) => p.id !== purging.id,
                    );
                    if (next.content.seasonProductId === purging.id)
                      next.content.seasonProductId = "";
                    next.content.seasonPages = next.content.seasonPages?.map(
                      (p) =>
                        p.productId === purging.id
                          ? { ...p, productId: "" }
                          : p,
                    );
                    next.reviews = next.reviews?.filter(
                      (r) => r.productId !== purging.id,
                    );
                  } else {
                    next.groups = next.groups.filter(
                      (g) => g.id !== purging.id,
                    );
                    next.products = next.products.map((p) => ({
                      ...p,
                      optionIds: p.optionIds.filter((id) => id !== purging.id),
                    }));
                  }
                  await save(next, "영구 삭제했습니다.");
                  setPurging(null);
                })
              }
            >
              영구 삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="preview-dialog">
          <DialogHeader>
            <DialogTitle>고객 미리보기</DialogTitle>
            <DialogDescription>
              실제 고객 페이지를 미리 볼 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="text-sm underline"
          >
            전체 페이지 새 창에서 보기 ↗
          </a>
          <iframe
            title="고객 페이지 미리보기"
            src="/"
            className="customer-preview-frame"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
