"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "./Breadcrumb";
import PageHeading from "./PageHeading";
import { useAuth } from "./AuthProvider";
import ProfileTab from "./mypage/ProfileTab";
import AddressTab from "./mypage/AddressTab";
import PreferencesTab from "./mypage/PreferencesTab";
import OrdersTab from "./mypage/OrdersTab";
import ReviewsTab from "./mypage/ReviewsTab";
import BowlRecipesTab from "./mypage/BowlRecipesTab";

const TABS = [
  { key: "profile", label: "기본 정보" },
  { key: "address", label: "배송지" },
  { key: "preferences", label: "취향·알레르기" },
  { key: "orders", label: "주문 내역" },
  { key: "reviews", label: "내가 쓴 리뷰" },
  { key: "bowls", label: "내 조합" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function MyPageView() {
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("profile");

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace("/login");
    }
  }, [isLoggedIn, router]);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <main className="wrap pv-wrap mypage-wrap">
      <Breadcrumb items={[["홈", "/"], ["마이페이지"]]} />
      <PageHeading>마이페이지</PageHeading>
      <div className="mypage-tabs" role="tablist" aria-label="마이페이지 메뉴">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab />}
      {tab === "address" && <AddressTab />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "reviews" && <ReviewsTab />}
      {tab === "bowls" && <BowlRecipesTab />}
    </main>
  );
}
