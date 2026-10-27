import StatusFeedback from "@/components/controls/StatusFeedback";

export default function EventLoading() {
  return (
    <main className="wrap ev-wrap">
      <StatusFeedback title="이벤트를 불러오고 있습니다." />
    </main>
  );
}
