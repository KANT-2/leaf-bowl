"use client";
import { Button } from "@/components/admin/button";
import { Switch } from "@/components/admin/switch";
import BannerPagesEditor from "./BannerPagesEditor";
import { allBannerPages } from "@/modules/catalog/banner-pages";
import HeroBanner from "@/components/HeroBanner";
import type { HeroSlide } from "@/modules/settings/hero";
import { Textarea } from "@/components/admin/textarea";
import { type Catalog, type Content } from "@/modules/catalog/schema";
import { uid } from "@/features/admin/editor-helpers";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Photo, Picker, Upload } from "./EditorFields";

export default function ContentEditor({
  originalSlides = [],
  catalog,
  busy,
  onSave,
  onRefresh,
}: {
  catalog: Catalog;
  originalSlides?: HeroSlide[];
  busy: boolean;
  onSave: (c: Content) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [c, setC] = useState<Content>(() => ({
    ...catalog.content,
    bannerPages: allBannerPages(catalog.content, originalSlides),
    bannerIncludesOriginals: true,
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
    [uploadCount, setUploadCount] = useState(0),
    [error, setError] = useState("");
  const uploading = uploadCount > 0;
  const setUploading = (active: boolean) => setUploadCount((count) => Math.max(0, count + (active ? 1 : -1)));
  const [bannerIndex, setBannerIndex] = useState(0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const bannerPages = c.bannerPages ?? [];
  const selectedBanner = bannerPages[bannerIndex];
  const originalBanner =
    selectedBanner?.originalIndex === undefined ? undefined : originalSlides[selectedBanner.originalIndex];
  const pages = c.seasonPages || [];
  const current = pages[index];
  const featured = catalog.products.find((p) => p.id === current?.productId);
  const update = (value: Partial<NonNullable<Content["seasonPages"]>[number]>) =>
    setC((s) => ({
      ...s,
      seasonPages: s.seasonPages?.map((p, i) => (i === index ? { ...p, ...value } : p)),
    }));

  function move(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= pages.length) {
      return;
    }
    const changed = [...pages];
    [changed[index], changed[next]] = [changed[next], changed[index]];
    setC({ ...c, seasonPages: changed });
    setIndex(next);
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || uploading) {
          return;
        }
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
          <p className="muted">메인 광고와 시즌 스페셜을 페이지별로 관리하세요.</p>
        </div>
        <Button type="submit" disabled={busy || uploading}>
          변경 저장
        </Button>
      </div>
      <div className="content-grid">
        <fieldset disabled={busy}>
          <BannerPagesEditor
            originalSlides={originalSlides}
            pages={bannerPages}
            visible={c.bannerVisible}
            index={bannerIndex}
            onIndex={setBannerIndex}
            onChange={(bannerPages) => setC((value) => ({ ...value, bannerPages }))}
            onVisible={(bannerVisible) => setC((value) => ({ ...value, bannerVisible }))}
            onBusy={setUploading}
          />
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
                    <Button type="button" variant="outline" disabled={index === 0} onClick={() => move(-1)}>
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
                  <Switch id="pageVisible" checked={current.visible} onCheckedChange={(v) => update({ visible: v })} />
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
                        image: catalog.products.find((p) => p.id === v)?.image || current.image,
                      })
                    }
                  />
                </label>
                <div className="field">
                  시즌 이미지
                  <Upload value={current.image} onChange={(v) => update({ image: v })} onBusy={setUploading} />
                </div>
              </div>
            ) : (
              <p className="muted">페이지 추가 버튼으로 시즌 스페셜을 등록해주세요.</p>
            )}
          </section>
        </fieldset>
        <div className="live-preview">
          <div className="eyebrow">LIVE PREVIEW · 저장 전 미리보기</div>
          <section className="surface" aria-label="메인 광고 미리보기">
            <div className="section-heading">
              <h2>메인 광고 · {bannerIndex + 1}페이지</h2>
              <div className="row-actions">
                <Button
                  type="button"
                  variant={!mobilePreview ? "default" : "outline"}
                  aria-pressed={!mobilePreview}
                  onClick={() => setMobilePreview(false)}
                >
                  PC
                </Button>
                <Button
                  type="button"
                  variant={mobilePreview ? "default" : "outline"}
                  aria-pressed={mobilePreview}
                  onClick={() => setMobilePreview(true)}
                >
                  모바일
                </Button>
              </div>
            </div>
            {selectedBanner?.image ? (
              <div style={mobilePreview ? { maxWidth: 390, marginInline: "auto" } : undefined}>
                <HeroBanner
                  content={{
                    ...c,
                    heroImage: mobilePreview
                      ? selectedBanner.mobileImage || selectedBanner.image
                      : selectedBanner.image,
                    heroMobileImage: "",
                    heroAlt: selectedBanner.alt,
                    heroHref: selectedBanner.href,
                  }}
                  preview
                />
                {(!c.bannerVisible || !selectedBanner.visible) && (
                  <p className="meta">이 페이지는 고객 화면에서 숨겨져 있습니다.</p>
                )}
              </div>
            ) : originalBanner ? (
              <section
                className="mini-home"
                style={mobilePreview ? { maxWidth: 390, marginInline: "auto" } : undefined}
                aria-label="기존 기본 배너 미리보기"
              >
                <span className="eyebrow">{originalBanner.eyebrow}</span>
                <h2>{selectedBanner.originalIndex === 0 ? c.heroTitle : originalBanner.title.join("\n")}</h2>
                <p>{selectedBanner.originalIndex === 0 ? c.heroDescription : originalBanner.body.join("\n")}</p>
                <Photo src={originalBanner.src} name={originalBanner.alt} className="original-banner-photo" />
                <p>{originalBanner.cta}</p>
                {(!c.bannerVisible || !selectedBanner.visible) && <p>이 페이지는 고객 화면에서 숨겨져 있습니다.</p>}
              </section>
            ) : (
              <p className="muted">PC 광고 이미지를 등록하면 여기에 표시됩니다.</p>
            )}
            {bannerPages.length > 0 && (
              <nav className="season-preview-arrows" aria-label="메인 광고 미리보기 페이지">
                <button
                  type="button"
                  aria-label="이전 광고 페이지"
                  disabled={bannerIndex === 0}
                  onClick={() => setBannerIndex(bannerIndex - 1)}
                >
                  ←
                </button>
                <span>
                  {bannerIndex + 1} / {bannerPages.length}
                </span>
                <button
                  type="button"
                  aria-label="다음 광고 페이지"
                  disabled={bannerIndex === bannerPages.length - 1}
                  onClick={() => setBannerIndex(bannerIndex + 1)}
                >
                  →
                </button>
              </nav>
            )}
          </section>
          {c.seasonVisible && current?.visible ? (
            <section className="season-preview season-layout-preview" aria-label="시즌 스페셜 고객 화면 미리보기">
              <div className="season-preview-copy">
                <span className="season-preview-label">THIS MONTH’S PICK</span>
                <h2>{current.title.replace(", ", ",\n")}</h2>
                <p>{current.description.replace(". ", ".\n")}</p>
                {featured && <span className="season-preview-link">{featured.name} 만나보기 ↗</span>}
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
              <nav className="season-preview-arrows" aria-label="시즌 미리보기 페이지">
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
            <section className="surface muted">시즌 스페셜 또는 선택한 페이지가 숨겨져 있습니다.</section>
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
