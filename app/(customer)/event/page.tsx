import type { Metadata } from "next";
import { connection } from "next/server";
import { readEvents } from "@/application/events";
import Breadcrumb from "@/components/Breadcrumb";
import CustomerEvents, { type CustomerEvent } from "@/components/CustomerEvents";
import { eventStatus, type EventStatus } from "@/modules/events/schema";

export const metadata: Metadata = { title: "이달의 이벤트 — leaf & bowl" };

/** 진행 중 → 예정 → 종료 순서로 보여주고, 같은 상태끼리는 관리자가 정한 순서를 따른다. */
const order: Record<EventStatus, number> = { ongoing: 0, scheduled: 1, ended: 2 };

export default async function EventPage() {
  await connection();
  const { events } = await readEvents();
  const list: CustomerEvent[] = events
    .filter((event) => event.visible)
    .map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      image: event.image,
      mobileImage: event.mobileImage,
      alt: event.alt,
      href: event.href,
      status: eventStatus(event),
    }))
    .sort((a, b) => order[a.status] - order[b.status]);
  return (
    <main className="wrap ev-wrap">
      <Breadcrumb items={[["홈", "/"], ["이달의 이벤트"]]} />
      <CustomerEvents events={list} />
    </main>
  );
}
