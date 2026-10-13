import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import MenuSection from "@/components/MenuSection";

// 과제 경로(/products): 전체 메뉴 목록. /menu 와 같은 화면이다.
export const metadata: Metadata = { title: "전체 메뉴 — leaf & bowl" };

export default function ProductsPage() {
  return (
    <main className="wrap pv-wrap">
      <Breadcrumb items={[["홈", "/"], ["메뉴"]]} />
      <MenuSection />
    </main>
  );
}
