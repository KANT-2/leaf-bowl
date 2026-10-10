import { publicSnapshot } from "@/lib/customer/catalog";
import { connection } from "next/server";
import { readCatalog } from "@/lib/admin/store";
import CustomerCatalogProvider from "@/components/CustomerCatalogProvider";
import type { Metadata, Viewport } from "next";
import AuthProvider from "@/components/AuthProvider";
import CartDrawer from "@/components/CartDrawer";
import CartProvider from "@/components/CartProvider";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ReviewWriteProvider from "@/components/ReviewWrite";
import ReviewsProvider from "@/components/ReviewsProvider";
import ToastProvider from "@/components/ToastProvider";
import { getDeliveryHours } from "@/lib/data/delivery";
import "../globals.css";

export const instant = false;

export const metadata: Metadata = {
  title: "leaf & bowl — 오늘의 신선한 한 그릇",
  description:
    "오늘의 신선한 한 그릇, leaf & bowl. 샐러드를 고르고 예약 배달을 체험해보세요.",
};

export const viewport: Viewport = {
  themeColor: "#194B38",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const snapshot = await readCatalog();
  const hours = await getDeliveryHours();
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <CustomerCatalogProvider initial={publicSnapshot(snapshot)}><ToastProvider>
          <AuthProvider>
          <ReviewsProvider>

            <ReviewWriteProvider>
              <CartProvider>
                <div className="announcement">
                  FRESH EVERY DAY · 오늘의 신선함을, 당신의 한 끼로
                </div>
                <Header />
                {children}
                <Footer hours={hours} />
                <CartDrawer hours={hours} />
              </CartProvider>
            </ReviewWriteProvider>

          </ReviewsProvider>
          </AuthProvider>
        </ToastProvider></CustomerCatalogProvider>
      </body>
    </html>
  );
}
