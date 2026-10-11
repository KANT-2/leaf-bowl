"use client";

import Image from "next/image";
import { useState } from "react";
import PhotoViewer from "./PhotoViewer";

/**
 * 리뷰 사진: 대표 사진 1장만 작게 보여주고 여러 장이면 "+N", 마우스를 올리면 흐려지며 "사진 보기",
 * 누르면 크게 보기 창에서 모두 넘겨 본다. 사진이 커도 카드 높이가 늘어나지 않게 크기를 고정한다.
 */
export default function ReviewPhotos({
  photos,
  label,
  size = 96,
}: {
  photos?: string[];
  label: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!photos?.length) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        className="rv-photo"
        style={{ width: size, height: size }}
        aria-label={`${label} ${photos.length}장 크게 보기`}
        onClick={(e) => {
          // 카드 전체가 링크인 곳(홈 리뷰)에서도 사진만 열리게 한다.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Image src={photos[0]} alt="" width={size * 2} height={size * 2} sizes={`${size}px`} />
        {photos.length > 1 && <span className="rv-photo-count">+{photos.length - 1}</span>}
        <span className="rv-photo-hover" aria-hidden="true">
          사진 보기
        </span>
      </button>
      {open && <PhotoViewer photos={photos} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}
