"use client";
import { Button } from "@/components/admin/button";
import { type Catalog } from "@/modules/catalog/schema";
import { statusNames } from "@/features/admin/editor-helpers";
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
      <p className="muted">삭제한 메뉴, 옵션 그룹, 메인 광고와 시즌 페이지를 복원할 수 있습니다.</p>
      <section className="surface">
        {[
          ...catalog.products.filter((p) => p.deleted).map((p) => ({ ...p, kind: "product" })),
          ...catalog.groups.filter((g) => g.deleted).map((g) => ({ ...g, kind: "group" })),
          ...(catalog.content.deletedBannerPages ?? []).map((p) => ({
            ...p,
            name: p.alt || "메인 광고 페이지",
            kind: "banner",
          })),
          ...(catalog.content.deletedSeasonPages ?? []).map((p) => ({ ...p, name: p.title, kind: "season" })),
        ].map((i) => (
          <div className="trash-row" key={i.kind + i.id}>
            <div>
              <strong>{i.name}</strong>
              <div className="meta">
                {
                  { product: "메뉴", group: "옵션 그룹", banner: "메인 광고 페이지", season: "시즌 스페셜 페이지" }[
                    i.kind
                  ]
                }
              </div>
            </div>
            <div className="row-actions">
              <Button
                variant="outline"
                disabled={
                  busy ||
                  (i.kind === "banner" && (catalog.content.bannerPages?.length ?? 0) >= 40) ||
                  (i.kind === "season" && (catalog.content.seasonPages?.length ?? 0) >= 20)
                }
                onClick={() =>
                  action(async () => {
                    const next = structuredClone(catalog);
                    if (i.kind === "product") {
                      const p = next.products.find((p) => p.id === i.id)!;
                      p.deleted = false;
                      p.optionIds = p.optionIds.filter((id) => next.groups.some((g) => g.id === id && !g.deleted));
                    } else if (i.kind === "banner") {
                      const page = next.content.deletedBannerPages?.find((p) => p.id === i.id);
                      if (!page || (next.content.bannerPages?.length ?? 0) >= 40) {
                        return;
                      }
                      next.content.bannerPages = [...(next.content.bannerPages ?? []), page];
                      next.content.deletedBannerPages = next.content.deletedBannerPages?.filter((p) => p.id !== i.id);
                    } else if (i.kind === "season") {
                      const page = next.content.deletedSeasonPages?.find((p) => p.id === i.id);
                      if (!page || (next.content.seasonPages?.length ?? 0) >= 20) {
                        return;
                      }
                      next.content.seasonPages = [
                        ...(next.content.seasonPages ?? []),
                        {
                          ...page,
                          productId: next.products.some((p) => p.id === page.productId && p.type === "salad")
                            ? page.productId
                            : "",
                        },
                      ];
                      next.content.deletedSeasonPages = next.content.deletedSeasonPages?.filter((p) => p.id !== i.id);
                    } else {
                      next.groups.find((g) => g.id === i.id)!.deleted = false;
                    }
                    await save(
                      next,
                      i.kind === "product"
                        ? `“${i.name}”을 ${statusNames[next.products.find((p) => p.id === i.id)!.status]} 상태로 복원했습니다.`
                        : "복원했습니다.",
                    );
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
          !catalog.groups.some((g) => g.deleted) &&
          !catalog.content.deletedBannerPages?.length &&
          !catalog.content.deletedSeasonPages?.length && <div className="empty">휴지통이 비어 있습니다.</div>}
      </section>
    </>
  );
}
