import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readCustomerCatalog } from "@/application/customer-catalog";
import CustomerProductPage from "@/components/CustomerProductPage";
import { getDeliveryHours } from "@/infrastructure/settings/postgres";

// 과제 경로(/products/[id]): 상품 상세. /product/[id] 와 같은 화면이고, 없는 번호는 404 안내 화면을 보여준다.
export const instant = false;
export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  const data = await readCustomerCatalog();
  const p = data.productFromParam((await params).id);
  return { title: p ? `${p.name} — leaf & bowl` : "메뉴를 찾을 수 없어요 — leaf & bowl" };
}

export default async function Page({ params }: PageProps<"/products/[id]">) {
  const data = await readCustomerCatalog();
  const p = data.productFromParam((await params).id);
  if (!p) {
    notFound();
  }
  return <CustomerProductPage id={p.id} hours={await getDeliveryHours()} />;
}
