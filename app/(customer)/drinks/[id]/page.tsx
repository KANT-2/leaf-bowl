import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readCustomerCatalog } from "@/application/customer-catalog";
import CustomerDrinkPage from "@/components/CustomerDrinkPage";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/drinks/[id]">): Promise<Metadata> {
  const data = await readCustomerCatalog();
  const id = (await params).id;
  const d = data.DRINKS.find((d) => d.id === id && d.name);
  return { title: d ? `${d.name} — leaf & bowl` : "음료를 찾을 수 없어요 — leaf & bowl" };
}

export default async function Page({ params }: PageProps<"/drinks/[id]">) {
  const data = await readCustomerCatalog();
  const id = (await params).id;
  const exists = data.DRINKS.some((d) => d.id === id && d.name);
  if (!exists) {
    notFound();
  }
  return <CustomerDrinkPage id={id} />;
}
