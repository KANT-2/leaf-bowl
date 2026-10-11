/** 홈 상단 배너 한 장 */
export interface HeroSlide {
  eyebrow: string;
  title: [string, string];
  body: [string, string];
  cta: string;
  href: string;
  src: string;
  alt: string;
  noteEn: string;
  noteKo: string;
  sticker: [string, string];
  /** 사진 속 그릇 테두리 (이미지 너비 대비 %, 중심과 가로·세로 반지름) */
  bowl: [cx: number, cy: number, rx: number, ry: number];
}
