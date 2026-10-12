import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import CustomerSeasons from "@/components/CustomerSeasons";

export const metadata: Metadata = { title: "이달의 이벤트 — leaf & bowl" };

export default function EventPage() {
  return (
    <main>
      <div className="wrap">
        <Breadcrumb items={[["홈", "/"], ["이달의 이벤트"]]} />
      </div>
      <CustomerSeasons />
    </main>
  );
}
