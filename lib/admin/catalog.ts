import { utcTimestampSchema } from "@/lib/utc-timestamp";
export { reviewDateTime } from "@/lib/time";
import { exampleReviews } from './reviews';
import { referenceIngredients } from './bowl-ingredients';
import { z } from 'zod';
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const image = z.string().max(200).refine(x => x === '' ||  /^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|avif)$/.test(x) || /^\/admin-assets\/reviews\/(?:chicken-avocado-review|chicken-avocado-detail|kale-juice-lunch)\.png$/.test(x) || /^\/admin-assets\/ingredients\/(?:romaine|kale|chicken|salmon|shrimp|tofu|chickpea|avocado|tomato|cucumber|mango|corn|mushroom|burrata|quinoa|crouton|nuts|olive)\.png$/.test(x) || /^\/admin-assets\/dressings\/(?:lemon-olive|balsamic|sesame|caesar|none)\.png$/.test(x) || /^\/admin-assets\/drinks\/(?:iced-americano|orange-juice|apple-juice|kale-green-juice)\.png$/.test(x) || /^\/api\/admin\/images\/[a-zA-Z0-9_.-]+$/.test(x) || /^\/admin-assets\/reference\/(?:hero|salad-(?:0[0-9]|1[01]))-cutout\.png$/.test(x), '올바른 이미지가 아닙니다.');
export const ingredientSchema = z.object({id,origin:z.string().trim().max(100).optional(),originDetail:z.string().trim().max(300).optional(),en:z.string().max(100).optional(),price:z.number().int().min(0).max(1000000).optional(),stage:z.enum(['GREENS','PROTEIN','VEGGIES','TOPPINGS']).optional(),color:z.string().max(40).optional(),name:z.string().trim().min(1).max(80),description:z.string().max(600),image,category:z.string().trim().min(1).max(80),allergens:z.string().max(400),status:z.enum(['active','soldout','hidden']),deleted:z.boolean()});
export type Ingredient = z.infer<typeof ingredientSchema>;
export const productSchema = z.object({ id, customerId: z.number().int().min(0).max(10000).optional(), en: z.string().max(100).optional(), ingredients: z.string().max(600).optional(), type: z.enum(['salad', 'drink', 'dressing']), name: z.string().trim().min(1).max(80), price: z.number().int().min(0).max(1000000), description: z.string().max(600), category: z.string().min(1).max(80), status: z.enum(['active', 'soldout', 'hidden']), badge: z.enum(['', 'BEST', 'NEW', 'PLANT', 'PICK']), image, allergens: z.string().max(400), optionIds: z.array(id).max(30), deleted: z.boolean() });
export const groupSchema = z.object({ id, name: z.string().trim().min(1).max(80), required: z.boolean(), multiple: z.boolean(), source: z.enum(['custom', 'drinks', 'dressings']), choices: z.array(z.object({ id, name: z.string().trim().min(1).max(80), price: z.number().int().min(0).max(1000000) })).max(80), deleted: z.boolean() });
export const seasonPageSchema = z.object({ id, title: z.string().trim().min(1).max(200), description: z.string().max(600), image, productId: z.string().max(80), visible: z.boolean() });
export const contentSchema = z.object({ heroTitle: z.string().trim().min(1).max(200), heroDescription: z.string().max(600), seasonTitle: z.string().trim().min(1).max(200), seasonDescription: z.string().max(600), seasonImage: image, seasonProductId: z.string().max(80), seasonVisible: z.boolean(), seasonPages: z.array(seasonPageSchema).max(20).optional() });
export const reviewSchema = z.object({id,sample:z.boolean().optional(),productId:z.string().max(80).optional(),via:z.enum(['pickup','delivery']).optional(),title:z.string().max(200),body:z.string().min(1).max(10000),images:z.array(image.refine(value=>value!== '', '이미지를 확인해주세요.')).max(10).optional(),rating:z.number().int().min(1).max(5),menu:z.string().max(120),drinks:z.array(z.string().trim().min(1).max(80)).max(20).optional(),author:z.string().min(1).max(80),date:z.string().max(40),createdAt:utcTimestampSchema.optional(),deleted:z.boolean()});
export type Review = z.infer<typeof reviewSchema>;
export const locationSchema = z.object({name:z.string().trim().min(1).max(100),address:z.string().trim().min(1).max(300),detailAddress:z.string().trim().max(200)});
export type StoreLocation = z.infer<typeof locationSchema>;
export const catalogSchema = z.object({ location: locationSchema.optional(), reviews: z.array(reviewSchema).max(500).optional(), ingredients: z.array(ingredientSchema).max(300).optional(), products: z.array(productSchema).max(300), categories: z.array(z.string().trim().min(1).max(80)).min(1).max(30).optional(), groups: z.array(groupSchema).max(50), content: contentSchema }).superRefine((s, ctx) => {
    if(s.content.seasonPages){if(new Set(s.content.seasonPages.map(p=>p.id)).size!==s.content.seasonPages.length)ctx.addIssue({code:'custom',message:'시즌 페이지 ID가 중복되었습니다.'});if(s.content.seasonPages.some(page=>page.productId&&!s.products.some(p=>p.id===page.productId&&p.type==='salad'&&!p.deleted)))ctx.addIssue({code:'custom',message:'시즌 페이지에 연결할 샐러드를 확인해주세요.'});}
    if(s.categories&&(new Set(s.categories).size!==s.categories.length||s.products.some(p=>p.type==='salad'&&!p.deleted&&!s.categories!.includes(p.category))))ctx.addIssue({code:'custom',message:'카테고리 중복 또는 메뉴 분류를 확인해주세요.'});
    if(s.reviews&&new Set(s.reviews.map(r=>r.id)).size!==s.reviews.length)ctx.addIssue({code:'custom',message:'리뷰 ID가 중복되었습니다.'});
    if(s.ingredients&&new Set(s.ingredients.map(i=>i.id)).size!==s.ingredients.length)ctx.addIssue({code:'custom',message:'재료 ID가 중복되었습니다.'});
    const check = (values: string[]) => new Set(values).size === values.length;
    if (!check(s.products.map(p => p.id)) || !check(s.groups.map(g => g.id)))
        ctx.addIssue({ code: 'custom', message: '메뉴 또는 옵션 ID가 중복되었습니다.' });
    const groupIds = new Set(s.groups.filter(g => !g.deleted).map(g => g.id));
    if (s.products.some(p => !p.deleted && p.optionIds.some(x => !groupIds.has(x))))
        ctx.addIssue({ code: 'custom', message: '삭제된 옵션을 메뉴에 연결할 수 없습니다.' });
    if (s.groups.some(g => !check(g.choices.map(c => c.id))))
        ctx.addIssue({ code: 'custom', message: '선택 항목 ID가 중복되었습니다.' });
    if (s.groups.some(g => !g.deleted && g.source === 'custom' && !g.choices.length))
        ctx.addIssue({ code: 'custom', message: '옵션 그룹에 선택 항목을 하나 이상 등록해주세요.' });
    if (s.content.seasonProductId && !s.products.some(p => p.id === s.content.seasonProductId && p.type === 'salad' && !p.deleted))
        ctx.addIssue({ code: 'custom', message: '시즌 스페셜에 연결할 샐러드를 확인해주세요.' });
});
export type Product = z.infer<typeof productSchema>;
export type OptionGroup = z.infer<typeof groupSchema>;
export type Content = z.infer<typeof contentSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Snapshot = {
    catalog: Catalog;
    revision: number;
    updatedAt: string;
};
const salads: [
    string,
    number,
    string,
    string,
    string
][] = [['레몬 치킨 아보카도', 10900, '로메인 · 치킨 · 아보카도 · 퀴노아 · 토마토', '든든한 단백질', 'BEST'], ['연어 아보카도', 13900, '로메인 · 연어 · 아보카도 · 오이', '든든한 단백질', 'BEST'], ['쉬림프 망고', 11900, '로메인 · 새우 · 망고 · 방울토마토', '든든한 단백질', 'BEST'], ['두부 퀴노아', 9900, '두부 · 퀴노아 · 양배추 · 에다마메', '플랜트 베이스', 'PLANT'], ['그릭 페타', 10900, '페타 · 토마토 · 오이 · 올리브', '플랜트 베이스', ''], ['스테이크 케일', 14900, '스테이크 · 케일 · 파르메산 · 토마토', '든든한 단백질', ''], ['튜나 스위트콘', 9900, '참치 · 옥수수 · 양파 · 오이', '든든한 단백질', ''], ['클래식 치킨 시저', 10900, '치킨 · 로메인 · 크루통 · 파르메산', '든든한 단백질', ''], ['머쉬룸 그레인', 9900, '버섯 · 현미 · 보리 · 루콜라', '플랜트 베이스', ''], ['부라타 가든', 12900, '부라타 · 토마토 · 루콜라 · 바질', '새로운 조합', 'PICK'], ['지중해 칙피 크런치 세트', 13900, '병아리콩 · 오이 · 허브 · 토마토 · 오렌지 주스', '새로운 조합', 'NEW'], ['스파이시 멕시칸 세트', 14900, '치킨 · 아보카도 · 블랙빈 · 옥수수 · 커피', '새로운 조합', 'NEW']];
export const initialCatalog: Catalog = { reviews: exampleReviews, ingredients: referenceIngredients, products: [...salads.map(([name, price, description, category, badge], i) => ({ id: 'salad-' + i, type: 'salad' as const, name, price, description, category, badge: badge as Product['badge'], status: 'active' as const, image: '/admin-assets/reference/salad-'+String(i).padStart(2,'0')+'-cutout.png', allergens: '', optionIds: ['dressing', 'drinks'], deleted: false })), ...['아이스 아메리카노', '오렌지 주스', '사과 주스', '케일 그린 주스'].map((name, i) => ({ id: 'drink-' + i, type: 'drink' as const, name, price: [3000, 4000, 4000, 4500][i], description: '', category: '음료', badge: '' as const, status: 'active' as const, image: '/admin-assets/drinks/'+['iced-americano','orange-juice','apple-juice','kale-green-juice'][i]+'.png', allergens: '', optionIds: [], deleted: false }))], groups: [{ id: 'dressing', name: '드레싱 선택', required: true, multiple: false, source: 'custom', deleted: false, choices: ['레몬 올리브', '발사믹', '참깨', '시저', '드레싱 없이'].map((name, i) => ({ id: 'dressing-' + i, name, price: 0 })) }, { id: 'drinks', name: '음료 추가', required: false, multiple: true, source: 'drinks', deleted: false, choices: [] }], content: { heroTitle: '좋은 하루는, 좋은 한 그릇에서.', heroDescription: '신선한 재료와 기분 좋은 조합. 오늘의 나를 위한 샐러드를 만나보세요.', seasonTitle: '조금 새로운 조합, 꽤 괜찮은 발견.', seasonDescription: '크리미한 부라타와 산뜻한 토마토. 이달엔 가볍게, 지중해로 떠나볼까요?', seasonImage: '/admin-assets/reference/salad-09-cutout.png', seasonProductId: 'salad-9', seasonVisible: true } };
export const money = (n: number) => n.toLocaleString('ko-KR') + '원';


export function saladCategories(catalog: Catalog): string[] {return catalog.categories??[...new Set(['든든한 단백질','플랜트 베이스','새로운 조합',...catalog.products.filter(p=>p.type==='salad').map(p=>p.category)])];}

export function reviewMenuLabel(review: Pick<Review,'menu'|'drinks'>): string {
const parts=review.menu.split(' · '),fulfillment=parts.length>1?parts.pop():undefined;
return [...parts,...(review.drinks??[])].join(' · ')+(fulfillment?'   |   '+fulfillment:'');
}
