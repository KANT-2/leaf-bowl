"use client";
import { Button } from "@/components/admin/button";
import { type Catalog } from "@/lib/admin/catalog";
import { RotateCcw, Trash2 } from "lucide-react";
export default function TrashPanel({
  catalog,
  busy,
  setPurging,
  save,
  action,
}: {
  catalog: Catalog;
  busy: boolean;
  setPurging: (value: { kind: string; id: string; name: string }) => void;
  save: (catalog: Catalog, message?: string) => Promise<void>;
  action: (fn: () => Promise<void>) => Promise<void>;
}) {
  return (
    <>
      <div className="eyebrow">RESTORE COLLECTION</div>
      <h1>휴지통</h1>
      <p className="muted">삭제한 메뉴와 옵션 그룹을 복원할 수 있습니다.</p>
      <section className="surface">
        {[
          ...catalog.products
            .filter((p) => p.deleted)
            .map((p) => ({ ...p, kind: "product" })),
          ...catalog.groups
            .filter((g) => g.deleted)
            .map((g) => ({ ...g, kind: "group" })),
        ].map((i) => (
          <div className="trash-row" key={i.kind + i.id}>
            <div>
              <strong>{i.name}</strong>
              <div className="meta">
                {i.kind === "product" ? "메뉴" : "옵션 그룹"}
              </div>
            </div>
            <div className="row-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const next = structuredClone(catalog);
                    if (i.kind === "product") {
                      const p = next.products.find((p) => p.id === i.id)!;
                      p.deleted = false;
                      p.status = "hidden";
                      p.optionIds = p.optionIds.filter((id) =>
                        next.groups.some((g) => g.id === id && !g.deleted),
                      );
                    } else
                      next.groups.find((g) => g.id === i.id)!.deleted = false;
                    await save(next);
                  })
                }
              >
                <RotateCcw size={15} />
                복원
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  setPurging({
                    kind: i.kind,
                    id: i.id,
                    name: i.name,
                  })
                }
              >
                <Trash2 size={15} />
                영구 삭제
              </Button>
            </div>
          </div>
        ))}
        {!catalog.products.some((p) => p.deleted) &&
          !catalog.groups.some((g) => g.deleted) && (
            <div className="empty">휴지통이 비어 있습니다.</div>
          )}
      </section>
    </>
  );
}
