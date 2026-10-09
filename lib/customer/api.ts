// 고객 API 응답 만들기. 카탈로그(lib/admin/store.ts)를 페이지별 응답 모양으로 바꾼다.
// 설계: docs/api-design.md
import type {
  Catalog,
  Product as CatalogProduct,
  Review as CatalogReview,
} from "@/lib/admin/catalog";

export type ProductType = CatalogProduct["type"];
export const PRODUCT_TYPES: readonly ProductType[] = ["salad", "drink", "dressing"];

export interface ProductSummary {
  /** 고객 주소 번호 (/product/0). 음료·드레싱은 null */
  id: number | null;
  /** 카탈로그 id ("salad-0") */
  key: string;
  type: ProductType;
  name: string;
  nameEn: string | null;
  price: number;
  category: string;
  badge: CatalogProduct["badge"];
  status: "active" | "soldout";
  imageUrl: string;
  allergens: string[];
}

export interface OptionChoice {
  key: string;
  name: string;
  price: number;
  available: boolean;
  allergens: string[];
}

export interface ProductDetail extends ProductSummary {
  description: string;
  ingredients: string | null;
  optionGroups: {
    id: string;
    name: string;
    required: boolean;
    multiple: boolean;
    choices: OptionChoice[];
  }[];
  rating: { average: number; count: number };
}

export interface ReviewItem {
  id: string;
  /** 고객 주소 번호. 메뉴와 연결되지 않은 리뷰는 null */
  productId: number | null;
  rating: number;
  title: string;
  body: string;
  author: string;
  date: string;
  images: string[];
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface Home {
  hero: { title: string; description: string };
  seasonPages: { title: string; description: string; image: string; productId: number | null }[];
  best: ProductSummary[];
  latestReviews: ReviewItem[];
}

const splitAllergens = (s: string) =>
  s
    .split(/[,·]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** 고객에게 보여도 되는 상품 (삭제·숨김 제외, 품절은 포함) */
export const isVisible = (p: CatalogProduct) => !p.deleted && p.status !== "hidden";

export function toSummary(p: CatalogProduct): ProductSummary {
  return {
    id: p.type === "salad" ? (p.customerId ?? null) : null,
    key: p.id,
    type: p.type,
    name: p.name,
    nameEn: p.en || null,
    price: p.price,
    category: p.category,
    badge: p.badge,
    status: p.status === "soldout" ? "soldout" : "active",
    imageUrl: p.image,
    allergens: splitAllergens(p.allergens),
  };
}

/** 분류 목록 (샐러드 메뉴 필터 순서) */
export function categoriesOf(catalog: Catalog): string[] {
  const used = catalog.products.filter((p) => p.type === "salad" && isVisible(p)).map((p) => p.category);
  return [...new Set([...(catalog.categories ?? []), ...used])].filter((c) => used.includes(c));
}

export function listProducts(catalog: Catalog, type: ProductType, category?: string): ProductSummary[] {
  return catalog.products
    .filter((p) => p.type === type && isVisible(p) && (!category || p.category === category))
    .map(toSummary);
}

/** 고객 주소 번호로 샐러드 찾기. 없거나 숨김·삭제면 undefined */
export function findSalad(catalog: Catalog, customerId: number): CatalogProduct | undefined {
  return catalog.products.find((p) => p.type === "salad" && p.customerId === customerId && isVisible(p));
}

const productReviewsOf = (catalog: Catalog, key: string) =>
  (catalog.reviews ?? []).filter((r) => !r.deleted && r.productId === key);

export function ratingOf(reviews: CatalogReview[]) {
  const count = reviews.length;
  const average = count ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10 : 0;
  return { average, count };
}

export function productDetail(catalog: Catalog, p: CatalogProduct): ProductDetail {
  const optionGroups = p.optionIds
    .map((gid) => catalog.groups.find((g) => g.id === gid && !g.deleted))
    .filter((g) => g !== undefined)
    .map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      multiple: g.multiple,
      choices:
        g.source === "custom"
          ? g.choices.map((c) => ({ key: c.id, name: c.name, price: c.price, available: true, allergens: [] }))
          : catalog.products
              .filter((c) => c.type === (g.source === "drinks" ? "drink" : "dressing") && isVisible(c))
              .map((c) => ({
                key: c.id,
                name: c.name,
                price: c.price,
                available: c.status === "active",
                allergens: splitAllergens(c.allergens),
              })),
    }));
  return {
    ...toSummary(p),
    description: p.description,
    ingredients: p.ingredients ?? null,
    optionGroups,
    rating: ratingOf(productReviewsOf(catalog, p.id)),
  };
}

export function toReviewItem(catalog: Catalog, r: CatalogReview): ReviewItem {
  const product = r.productId ? catalog.products.find((p) => p.id === r.productId) : undefined;
  return {
    id: r.id,
    productId: product?.customerId ?? null,
    rating: r.rating,
    title: r.title,
    body: r.body,
    author: r.author,
    date: r.date,
    images: r.images ?? [],
  };
}

/** 최신순 (작성 시각이 없으면 저장 순서의 뒤쪽을 최신으로 본다) */
function newestFirst(reviews: CatalogReview[]): CatalogReview[] {
  return reviews
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.createdAt ?? "").localeCompare(a.r.createdAt ?? "") || b.i - a.i)
    .map(({ r }) => r);
}

export function productReviews(catalog: Catalog, p: CatalogProduct, page: number, size: number) {
  const reviews = newestFirst(productReviewsOf(catalog, p.id));
  const result: Page<ReviewItem> & { rating: { average: number; count: number } } = {
    items: reviews.slice((page - 1) * size, page * size).map((r) => toReviewItem(catalog, r)),
    page,
    size,
    total: reviews.length,
    rating: ratingOf(reviews),
  };
  return result;
}

export function home(catalog: Catalog): Home {
  const { content } = catalog;
  const customerIdOf = (key: string) => catalog.products.find((p) => p.id === key && isVisible(p))?.customerId ?? null;
  return {
    hero: { title: content.heroTitle, description: content.heroDescription },
    seasonPages: (content.seasonPages ?? [])
      .filter((s) => s.visible)
      .map((s) => ({ title: s.title, description: s.description, image: s.image, productId: s.productId ? customerIdOf(s.productId) : null })),
    best: catalog.products.filter((p) => p.type === "salad" && p.badge === "BEST" && isVisible(p)).map(toSummary),
    latestReviews: newestFirst((catalog.reviews ?? []).filter((r) => !r.deleted))
      .slice(0, 3)
      .map((r) => toReviewItem(catalog, r)),
  };
}

/** ?page=&size= 읽기. 형식이 틀리면 null */
export function parsePaging(params: URLSearchParams): { page: number; size: number } | null {
  const page = params.get("page") ?? "1";
  const size = params.get("size") ?? "10";
  if (!/^\d+$/.test(page) || !/^\d+$/.test(size)) return null;
  const p = Number(page);
  const s = Number(size);
  return p >= 1 && s >= 1 && s <= 50 ? { page: p, size: s } : null;
}
