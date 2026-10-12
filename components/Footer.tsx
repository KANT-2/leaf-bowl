"use client";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Link from "next/link";
import { formatDeliveryHours, type DeliveryHours } from "@/modules/delivery/hours";

export default function Footer({ hours }: { hours: DeliveryHours }) {
  const { catalog } = useCustomerCatalog();
  return (
    <footer className="wrap">
      <Link className="logo" href="/">
        leaf &amp; bowl<span className="logo-sub footer-sub">작은 습관, 더 싱그러운 하루.</span>
      </Link>
      <p className="footer-store">
        {catalog.location && (
          <span>
            {catalog.location.name} · {catalog.location.address} {catalog.location.detailAddress}
            <br />
          </span>
        )}
        {formatDeliveryHours(hours)}
      </p>
      <div>© 2026 leaf &amp; bowl concept.</div>
    </footer>
  );
}
