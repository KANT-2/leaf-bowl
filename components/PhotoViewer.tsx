"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface Props {
  photos: string[];
  /** 처음 보여줄 사진 번호 */
  start?: number;
  /** 화면 읽기용 설명 (예: "연어가 부드러워요 리뷰 사진") */
  label: string;
  onClose: () => void;
}

/** 리뷰 사진 크게 보기. ← → 버튼·방향키로 넘기고, ×·Esc·바깥 클릭으로 닫는다. */
export default function PhotoViewer({ photos, start = 0, label, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);
  const total = photos.length;

  useEffect(() => {
    const d = dialog.current;
    if (!d) {
      return;
    }
    d.showModal();
    return () => d.close();
  }, []);

  const go = (n: number) => setIndex((n + total) % total);

  return (
    <dialog
      ref={dialog}
      className="pviewer"
      aria-label={label}
      // 개발 모드의 effect 재실행으로 늦게 오는 close 이벤트는 무시한다.
      onClose={() => {
        if (!dialog.current?.open) {
          onClose();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          dialog.current?.close();
        }
      }}
      onKeyDown={(e) => {
        if (total < 2) {
          return;
        }
        if (e.key === "ArrowRight") {
          go(index + 1);
        }
        if (e.key === "ArrowLeft") {
          go(index - 1);
        }
      }}
    >
      <div className="pviewer-body">
        <button type="button" className="pviewer-close" aria-label="사진 닫기" onClick={() => dialog.current?.close()}>
          ×
        </button>
        <div className="pviewer-frame">
          <Image
            src={photos[index]}
            alt={`${label} ${index + 1}/${total}`}
            fill
            sizes="(max-width: 700px) 100vw, 720px"
            unoptimized
          />
        </div>
        {total > 1 && (
          <div className="pviewer-nav">
            <button type="button" aria-label="이전 사진" onClick={() => go(index - 1)}>
              ←
            </button>
            <span aria-live="polite">
              {index + 1} / {total}
            </span>
            <button type="button" aria-label="다음 사진" onClick={() => go(index + 1)}>
              →
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
