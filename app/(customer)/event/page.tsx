import type { Metadata } from "next";
import { connection } from "next/server";
import { readEvents } from "@/application/events";
import Breadcrumb from "@/components/Breadcrumb";
import CustomerEvents from "@/components/CustomerEvents";
import { customerEvents } from "@/modules/events/schema";

export const metadata: Metadata = { title: "이달의 이벤트 — leaf & bowl" };

export default async function EventPage() {
  await connection();
  const { events } = await readEvents();
  return (
    <main className="wrap ev-wrap">
      <Breadcrumb items={[["홈", "/"], ["이달의 이벤트"]]} />
      <CustomerEvents events={customerEvents(events)} />
    </main>
  );
}
