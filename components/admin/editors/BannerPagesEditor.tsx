"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/admin/button";
import { Input } from "@/components/admin/input";
import { Switch } from "@/components/admin/switch";
import type { HeroSlide } from "@/modules/settings/hero";
import type { BannerPage } from "@/modules/catalog/schema";
import { uid } from "@/features/admin/editor-helpers";
import { Photo, Upload } from "./EditorFields";

export default function BannerPagesEditor({
  originalSlides,
  pages,
  visible,
  index,
  onIndex,
  onChange,
  onVisible,
  onBusy,
}: {
  originalSlides: HeroSlide[];
  pages: BannerPage[];
  visible: boolean;
  index: number;
  onIndex: (index: number) => void;
  onChange: (pages: BannerPage[]) => void;
  onVisible: (visible: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const current = pages[index];
  const original = current?.originalIndex === undefined ? undefined : originalSlides[current.originalIndex];
  const update = (value: Partial<BannerPage>) =>
    onChange(pages.map((page, i) => (i === index ? { ...page, ...value } : page)));

  function move(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= pages.length) {
      return;
    }
    const changed = [...pages];
    [changed[index], changed[next]] = [changed[next], changed[index]];
    onChange(changed);
    onIndex(next);
  }
  return (
    <section className="surface">
      <h2>메인 광고 이미지</h2>
      <p className="meta">
        기존 배너와 새 광고를 페이지별로 관리하세요. 고객 화면에는 저장한 페이지 순서대로 표시됩니다.
      </p>
      <div className="toggle-row">
        <label htmlFor="bannerVisible">고객 화면에 노출</label>
        <Switch id="bannerVisible" checked={visible} onCheckedChange={onVisible} />
      </div>
      <div className="season-page-tabs" role="group" aria-label="메인 광고 페이지 선택">
        {pages.map((page, i) => (
          <Button
            key={page.id}
            type="button"
            variant={index === i ? "default" : "outline"}
            aria-pressed={index === i}
            onClick={() => onIndex(i)}
          >
            {i + 1}페이지{page.originalIndex !== undefined ? " · 기존" : ""}
            {!page.visible ? " · 숨김" : ""}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={pages.length >= 40}
          onClick={() => {
            onChange([...pages, { id: uid(), image: "", mobileImage: "", alt: "", href: "", visible: true }]);
            onIndex(pages.length);
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
              <Button type="button" variant="outline" disabled={index === pages.length - 1} onClick={() => move(1)}>
                뒤로
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange(pages.filter((_, i) => i !== index));
                  onIndex(Math.max(0, index - 1));
                }}
              >
                페이지 삭제
              </Button>
            </div>
          </div>
          <div className="toggle-row">
            <label htmlFor="bannerPageVisible">이 페이지 노출</label>
            <Switch
              id="bannerPageVisible"
              checked={current.visible}
              onCheckedChange={(value) => update({ visible: value })}
            />
          </div>
          {original && !current.image && (
            <div className="field" role="group" aria-label="기존 배너 이미지">
              기존 배너 이미지
              <Photo src={original.src} name={original.alt} />
              <p className="meta">
                기존 디자인을 유지하고 있습니다. 아래에 PC 이미지를 등록하면 이 페이지의 배너가 교체됩니다.
              </p>
            </div>
          )}
          <div className="field" role="group" aria-label="PC 광고 이미지">
            PC 광고 이미지
            <Upload value={current.image} onChange={(image) => update({ image })} onBusy={onBusy} />
          </div>
          <div className="field" role="group" aria-label="모바일 광고 이미지">
            모바일 광고 이미지
            <Upload value={current.mobileImage} onChange={(mobileImage) => update({ mobileImage })} onBusy={onBusy} />
          </div>
          <p className="meta">
            PC는 가로형, 모바일은 세로형을 권장합니다. 모바일 이미지가 없으면 PC 이미지를 사용합니다. PC 이미지가 없는
            새 페이지는 표시하지 않습니다. 기존 페이지의 교체 이미지를 제거하면 기존 디자인으로 돌아갑니다.
          </p>
          <label className="field">
            이미지 설명 (선택)
            <Input
              value={current.alt}
              maxLength={300}
              onChange={(e) => update({ alt: e.target.value })}
              placeholder="화면을 읽어주는 기능을 위한 이미지 설명"
            />
          </label>
          <label className="field">
            클릭 시 이동 주소 (선택)
            <Input
              value={current.href}
              maxLength={300}
              onChange={(e) => update({ href: e.target.value })}
              placeholder="예: /menu"
            />
          </label>
        </div>
      ) : (
        <p className="muted">페이지 추가 버튼으로 메인 광고 이미지를 등록해주세요.</p>
      )}
    </section>
  );
}
