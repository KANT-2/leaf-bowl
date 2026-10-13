import CustomerHome from "@/components/CustomerHome";
import { readEvents } from "@/application/events";
import { customerEvents } from "@/modules/events/schema";

export default async function Home() {
  // 이벤트를 못 읽어도 홈 화면은 기존 배너만으로 보여준다.
  const events = await readEvents().then(
    (snapshot) =>
      customerEvents(snapshot.events.filter((event) => event.heroVisible)).filter(
        (event) => event.status === "ongoing" && event.image,
      ),
    () => [],
  );
  return <CustomerHome events={events} />;
}
