import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readCustomerCatalog } from "@/application/customer-catalog";
import CustomerProductPage from "@/components/CustomerProductPage";
import { getDeliveryHours } from "@/infrastructure/settings/postgres";

export const instant = false;
export async function generateMetadata({ params }: PageProps<"/product/[id]">): Promise<Metadata> {
  const data = await readCustomerCatalog();
  const p = data.productFromParam((await params).id);
  return { title: p ? `${p.name} — leaf & bowl` : "메뉴를 찾을 수 없어요 — leaf & bowl" };
}

export default async function Page({ params }: PageProps<"/product/[id]">) {
  const data = await readCustomerCatalog();
  const p = data.productFromParam((await params).id);
  if (!p) {
    notFound();
  }
  return <CustomerProductPage id={p.id} hours={await getDeliveryHours()} />;
}
