"use client";
import { Button } from "@/components/admin/button";
import { money, type Catalog, type OptionGroup } from "@/lib/admin/catalog";
import { blankGroup } from "@/lib/admin/editor-helpers";
import { Pencil, Plus, Trash2 } from "lucide-react";
export default function OptionsPanel({
  catalog,
  busy,
  setGroup,
  setDeleting,
}: {
  catalog: Catalog;
  busy: boolean;
  setGroup: (value: OptionGroup) => void;
  setDeleting: (value: {
    kind: "product" | "group";
    id: string;
    name: string;
  }) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOUR WAY</div>
          <h1>옵션 관리</h1>
          <p className="muted">
            드레싱과 추가 메뉴를 원하는 방식으로 구성하세요.
          </p>
        </div>
        <Button disabled={busy} onClick={() => setGroup(blankGroup())}>
          <Plus size={18} />
          옵션 그룹 추가
        </Button>
      </div>
      <div className="group-grid">
        {catalog.groups
          .filter((g) => !g.deleted)
          .map((g) => (
            <section key={g.id} className="surface">
              <div className="group-heading">
                <div>
                  <h2>{g.name}</h2>
                  <div className="meta">
                    {g.required ? "필수 선택" : "선택 사항"} ·{" "}
                    {g.multiple ? "복수 선택" : "단일 선택"}
                  </div>
                </div>
                <span className="pill">
                  {
                    catalog.products.filter(
                      (p) => !p.deleted && p.optionIds.includes(g.id),
                    ).length
                  }
                  개 메뉴에 연결
                </span>
              </div>
              <div className="choices-list">
                {(g.source !== "custom"
                  ? catalog.products.filter(
                      (p) =>
                        p.type ===
                          (g.source === "dressings" ? "dressing" : "drink") &&
                        !p.deleted &&
                        p.status !== "hidden",
                    )
                  : g.choices
                ).map((c) => (
                  <div key={c.id}>
                    <span>
                      {c.name}{" "}
                      {"status" in c && c.status === "soldout" && (
                        <span className="status-tag soldout">품절</span>
                      )}
                    </span>
                    <span className="meta">
                      {c.price ? "+" + money(c.price) : "추가 금액 없음"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="row-actions">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setGroup(structuredClone(g))}
                >
                  <Pencil size={15} />
                  설정 수정
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setDeleting({
                      kind: "group",
                      id: g.id,
                      name: g.name,
                    })
                  }
                >
                  <Trash2 size={15} />
                  삭제
                </Button>
              </div>
            </section>
          ))}
      </div>
      {!catalog.groups.some((g) => !g.deleted) && (
        <section className="surface empty">
          옵션 그룹을 추가한 뒤 메뉴 수정 화면에서 연결해주세요.
        </section>
      )}
    </>
  );
}
