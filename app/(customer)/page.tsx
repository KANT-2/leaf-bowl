import { Suspense } from "react";
import CustomerHome from "@/components/CustomerHome";
import { readEvents } from "@/application/events";
import { customerEvents } from "@/modules/events/schema";

async function HomeWithEvents() {
  // 이벤트 조회에 실패하면 기본 배너로 홈 화면을 표시한다.
  const events = await readEvents().then(
    (snapshot) =>
      customerEvents(snapshot.events.filter((event) => event.heroVisible)).filter(
        (event) => event.status === "ongoing" && event.image,
      ),
    () => [],
  );

  return <CustomerHome events={events} />;
}

export default function Home() {
  return (
    <Suspense fallback={<CustomerHome events={[]} />}>
      <HomeWithEvents />
    </Suspense>
  );
}
