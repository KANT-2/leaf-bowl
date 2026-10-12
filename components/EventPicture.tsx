import { getImageProps } from "next/image";
import type { CustomerEvent } from "@/modules/events/schema";

/**
 * 관리자가 올린 이벤트 사진. 원본(수 MB PNG)을 그대로 받지 않고 Next.js 이미지 최적화로
 * 화면 크기에 맞춘 WebP 를 받는다. 모바일 이미지가 있으면 좁은 화면에서 그 사진을 쓴다.
 */
export default function EventPicture({
  event,
  className,
  sizes,
  mobileUpTo,
}: {
  event: CustomerEvent;
  className: string;
  sizes: string;
  /** 이 폭(px) 이하에서 모바일 이미지를 쓴다 */
  mobileUpTo: number;
}) {
  const alt = event.alt || event.title;
  const { props } = getImageProps({ src: event.image, alt, width: 1200, height: 900, sizes, loading: "lazy" });
  const mobile = event.mobileImage
    ? getImageProps({ src: event.mobileImage, alt, width: 900, height: 1200, sizes }).props
    : null;
  return (
    <picture className={className}>
      {mobile && <source media={`(max-width: ${mobileUpTo}px)`} srcSet={mobile.srcSet} sizes={mobile.sizes} />}
      <img {...props} alt={alt} />
    </picture>
  );
}
