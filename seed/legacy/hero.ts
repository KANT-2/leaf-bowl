import type { HeroSlide } from "@/modules/settings/hero";
// 이전 JSON 데이터의 변환 기준. 실제 앱의 배너는 db/seed.sql → app_settings에서 읽는다.
export const HERO_SLIDES: HeroSlide[] = [
  {
    eyebrow: "FRESH BOWL, FRESH DAY",
    title: ["좋은 하루는,", "좋은 한 그릇에서."],
    body: [
      "신선한 재료와 기분 좋은 조합.",
      "오늘의 나를 위한 샐러드를 만나보세요.",
    ],
    cta: "오늘의 샐러드 고르기",
    href: "/menu",
    src: "/images/hero-cutout.png",
    alt: "레몬과 아보카도를 곁들인 구운 치킨 샐러드",
    noteEn: "LEMON CHICKEN BOWL",
    noteKo: "레몬 치킨 아보카도",
    sticker: ["fresh", "feels good."],
    bowl: [50, 50.5, 44.4, 39],
  },
  {
    eyebrow: "PROTEIN BOWL, STRONG DAY",
    title: ["든든한 한 끼도,", "가볍게 한 그릇."],
    body: [
      "부드럽게 구운 연어와 잘 익은 아보카도.",
      "단백질 29g으로 오후까지 든든하게.",
    ],
    cta: "연어 아보카도 보기",
    href: "/product/1",
    src: "/images/salad-01-cutout.png",
    alt: "구운 연어와 아보카도, 오이를 담은 샐러드",
    noteEn: "SALMON AVOCADO BOWL",
    noteKo: "연어 아보카도",
    sticker: ["strong", "stays light."],
    bowl: [50, 50, 43.7, 43.7],
  },
  {
    eyebrow: "PLANT BOWL, GREEN DAY",
    title: ["초록으로 채운,", "가벼운 하루."],
    body: [
      "고소한 구운 두부와 알알이 퀴노아.",
      "식물성 재료만으로도 충분히 맛있게.",
    ],
    cta: "두부 퀴노아 보기",
    href: "/product/3",
    src: "/images/salad-03-cutout.png",
    alt: "구운 두부와 퀴노아, 에다마메를 담은 샐러드",
    noteEn: "TOFU QUINOA BOWL",
    noteKo: "두부 퀴노아",
    sticker: ["green", "tastes good."],
    bowl: [50, 49.5, 41.7, 41.7],
  },
];
