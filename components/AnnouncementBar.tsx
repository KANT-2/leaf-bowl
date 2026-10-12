"use client";
import { useCustomerCatalog } from "./CustomerCatalogProvider";

const DEFAULT_TEXT = "FRESH EVERY DAY · 오늘의 신선함을, 당신의 한 끼로";

/** 맨 위 공지 바. 관리자가 등록한 이달의 이벤트·신메뉴가 있으면 그 내용을, 없으면 기본 문구를 보여준다. */
export default function AnnouncementBar() {
  const { catalog, visibleProducts } = useCustomerCatalog();
  const content = catalog.content;
  const pages = (
    content.seasonPages ?? [
      {
        id: "season",
        title: content.seasonTitle,
        description: content.seasonDescription,
        image: content.seasonImage,
        productId: content.seasonProductId,
        visible: true,
      },
    ]
  ).filter((p) => p.visible);
  const event = content.seasonVisible && pages.length ? pages[0].title : "";
  const newNames = visibleProducts.filter((p) => p.isNew).map((p) => p.name);

  const parts = [
    event && `이달의 이벤트 · ${event}`,
    newNames.length > 0 && `신메뉴 출시 · ${newNames.join(", ")}`,
  ].filter(Boolean);

  return (
    <div className="announcement" id="announcement">
      <span>{parts.length ? parts.join("  ·  ") : DEFAULT_TEXT}</span>
    </div>
  );
}
