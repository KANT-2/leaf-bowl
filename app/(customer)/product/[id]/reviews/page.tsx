import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readCustomerCatalog } from "@/application/customer-catalog";
import CustomerProductReviewsPage from '@/components/CustomerProductReviewsPage';

export const instant = false;
export async function generateMetadata({params}:PageProps<"/product/[id]/reviews">):Promise<Metadata>{
  const data=await readCustomerCatalog();const p=data.productFromParam((await params).id);
  return {title:p?`${p.name} 리뷰 — leaf & bowl`:'메뉴를 찾을 수 없어요 — leaf & bowl'};
}
export default async function Page({params}:PageProps<"/product/[id]/reviews">){
  const data=await readCustomerCatalog();const p=data.productFromParam((await params).id);if(!p)notFound();
  return <CustomerProductReviewsPage id={p.id} />;
}
