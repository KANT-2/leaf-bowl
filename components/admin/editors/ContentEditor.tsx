"use client";
import { Button } from "@/components/admin/button";
import { Switch } from "@/components/admin/switch";
import { Textarea } from "@/components/admin/textarea";
import { type Catalog, type Content } from "@/lib/admin/catalog";
import { uid } from "@/lib/admin/editor-helpers";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Photo, Picker, Upload } from "./EditorFields";

export default function ContentEditor({
  catalog,
  busy,
  onSave,
  onRefresh,
}: {
  catalog: Catalog;
  busy: boolean;
  onSave: (c: Content) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [c, setC] = useState<Content>(() => ({
    ...catalog.content,
    seasonPages: catalog.content.seasonPages ?? [
      {
        id: uid(),
        title: catalog.content.seasonTitle,
        description: catalog.content.seasonDescription,
        image: catalog.content.seasonImage,
        productId: catalog.content.seasonProductId,
        visible: true,
      },
    ],
  }));
  const [index, setIndex] = useState(0),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const pages = c.seasonPages || [];
  const current = pages[index];
  const featured = catalog.products.find((p) => p.id === current?.productId);
  const update = (
    value: Partial<NonNullable<Content["seasonPages"]>[number]>,
  ) =>
    setC((s) => ({
      ...s,
      seasonPages: s.seasonPages?.map((p, i) =>
        i === index ? { ...p, ...value } : p,
      ),
    }));
  function move(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= pages.length) return;
    const changed = [...pages];
    [changed[index], changed[next]] = [changed[next], changed[index]];
    setC({ ...c, seasonPages: changed });
    setIndex(next);
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave(c);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <div className="page-heading">
        <div>
          <div className="eyebrow">FRESH BOWL, FRESH DAY</div>
          <h1>고객 페이지 편집</h1>
          <p className="muted">시즌 샐러드를 한 페이지씩 소개하세요.</p>
        </div>
        <Button type="submit" disabled={busy || uploading}>
          변경 저장
        </Button>
      </div>
      <div className="content-grid">
        <fieldset disabled={busy || uploading}>
          <section className="surface">
            <h2>메인 화면</h2>
            <label className="field">
              메인 문구
              <Textarea
                required
                maxLength={200}
                value={c.heroTitle}
                onChange={(e) => setC({ ...c, heroTitle: e.target.value })}
              />
            </label>
            <label className="field">
              소개 문구
              <Textarea
                maxLength={600}
                value={c.heroDescription}
                onChange={(e) =>
                  setC({ ...c, heroDescription: e.target.value })
                }
              />
            </label>
          </section>
          <section className="surface">
            <h2>시즌 스페셜</h2>
            <div className="toggle-row">
              <label htmlFor="seasonVisible">고객 화면에 노출</label>
              <Switch
                id="seasonVisible"
                checked={c.seasonVisible}
                onCheckedChange={(v) => setC({ ...c, seasonVisible: v })}
              />
            </div>
            <div className="season-page-tabs">
              {pages.map((p, i) => (
                <Button
                  key={p.id}
                  type="button"
                  variant={index === i ? "default" : "outline"}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}페이지{!p.visible ? " · 숨김" : ""}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={pages.length >= 20}
                onClick={() => {
                  setC({
                    ...c,
                    seasonPages: [
                      ...pages,
                      {
                        id: uid(),
                        title: "새로운 시즌 샐러드",
                        description: "",
                        image: "",
                        productId: "",
                        visible: true,
                      },
                    ],
                  });
                  setIndex(pages.length);
                }}
              >
                <Plus size={16} />
                페이지 추가
              </Button>
            </div>
            {current ? (
              <div key={current.id}>
                <div className="section-heading">
                  <h3>{index + 1}페이지 설정</h3>
                  <div className="row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={index === 0}
                      onClick={() => move(-1)}
                    >
                      앞으로
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={index === pages.length - 1}
                      onClick={() => move(1)}
                    >
                      뒤로
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setC({
                          ...c,
                          seasonPages: pages.filter((_, i) => i !== index),
                        });
                        setIndex(Math.max(0, index - 1));
                      }}
                    >
                      페이지 삭제
                    </Button>
                  </div>
                </div>
                <div className="toggle-row">
                  <label htmlFor="pageVisible">이 페이지 노출</label>
                  <Switch
                    id="pageVisible"
                    checked={current.visible}
                    onCheckedChange={(v) => update({ visible: v })}
                  />
                </div>
                <label className="field">
                  제목
                  <Textarea
                    required
                    maxLength={200}
                    value={current.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                <label className="field">
                  소개 문구
                  <Textarea
                    maxLength={600}
                    value={current.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                </label>
                <label className="field">
                  연결 메뉴
                  <Picker
                    value={current.productId}
                    label="시즌 연결 메뉴"
                    options={[
                      ["", "연결 없음"],
                      ...catalog.products
                        .filter((p) => p.type === "salad" && !p.deleted)
                        .map((p) => [p.id, p.name] as [string, string]),
                    ]}
                    onChange={(v) =>
                      update({
                        productId: v,
                        image:
                          catalog.products.find((p) => p.id === v)?.image ||
                          current.image,
                      })
                    }
                  />
                </label>
                <div className="field">
                  시즌 이미지
                  <Upload
                    value={current.image}
                    onChange={(v) => update({ image: v })}
                    onBusy={setUploading}
                  />
                </div>
              </div>
            ) : (
              <p className="muted">
                페이지 추가 버튼으로 시즌 스페셜을 등록해주세요.
              </p>
            )}
          </section>
        </fieldset>
        <div className="live-preview">
          <div className="eyebrow">LIVE PREVIEW · 저장 전 미리보기</div>
          <section className="mini-home">
            <div className="brand">leaf & bowl</div>
            <h2>{c.heroTitle}</h2>
            <p>{c.heroDescription}</p>
          </section>
          {c.seasonVisible && current?.visible ? (
            <section
              className="season-preview season-layout-preview"
              aria-label="시즌 스페셜 고객 화면 미리보기"
            >
              <div className="season-preview-copy">
                <span className="season-preview-label">THIS MONTH’S PICK</span>
                <h2>{current.title.replace(", ", ",\n")}</h2>
                <p>{current.description.replace(". ", ".\n")}</p>
                {featured && (
                  <span className="season-preview-link">
                    {featured.name} 만나보기 ↗
                  </span>
                )}
              </div>
              <div className="season-preview-food">
                <Photo
                  src={current.image || featured?.image || ""}
                  name={featured?.name || "시즌 스페셜"}
                  className="season-photo"
                />
              </div>
              <div className="season-preview-caption">
                <span>NEW COMBINATION</span>
                <strong>{featured?.name || current.title}</strong>
                <p>{current.description}</p>
              </div>
              <nav
                className="season-preview-arrows"
                aria-label="시즌 미리보기 페이지"
              >
                <button
                  type="button"
                  aria-label="이전 시즌 페이지"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  ←
                </button>
                <span>
                  {index + 1} / {pages.length}
                </span>
                <button
                  type="button"
                  aria-label="다음 시즌 페이지"
                  disabled={index === pages.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  →
                </button>
              </nav>
            </section>
          ) : (
            <section className="surface muted">
              시즌 스페셜 또는 선택한 페이지가 숨겨져 있습니다.
            </section>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
          <Button type="button" variant="outline" onClick={onRefresh}>
            최신 내용 불러오기
          </Button>
        </div>
      )}
    </form>
  );
}
