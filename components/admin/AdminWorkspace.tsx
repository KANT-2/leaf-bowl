"use client";
import { Button } from "@/components/admin/button";
import OriginAllergyManager from "@/components/admin/OriginAllergyManager";
import SalesRanking from "@/components/admin/SalesRanking";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/admin/sidebar";
import { type Product } from "@/lib/admin/catalog";
import { blankProduct } from "@/lib/admin/editor-helpers";
import {
  BarChart3,
  Eye,
  LayoutTemplate,
  Leaf,
  MapPin,
  MessageSquare,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import CatalogDialogs from "./CatalogDialogs";
import BowlMatchManager from "./editors/BowlMatchManager";
import ContentEditor from "./editors/ContentEditor";
import LocationManager from "./editors/LocationManager";
import ReviewManager from "./editors/ReviewManager";
import OptionsPanel from "./OptionsPanel";
import ProductsPanel from "./ProductsPanel";
import TrashPanel from "./TrashPanel";
import { useAdminCatalog } from "./use-admin-catalog";
import { useCatalogEditors } from "./use-catalog-editors";
export default function Admin() {
  const [view, setView] = useState("");
  const [type, setType] = useState<Product["type"]>("salad");
  const editors = useCatalogEditors();
  const { setProduct, setGroup, setDeleting, setPurging, setPreview } = editors;
  const { snapshot, loadError, busy, load, save, action } = useAdminCatalog(
    view === "reviews",
  );
  const [navigationReady, setNavigationReady] = useState(false);
  useEffect(() => {
    const restore = () => {
      const id = window.location.hash.slice(1);
      setView(
        [
          "products",
          "options",
          "bowlmatch",
          "content",
          "reviews",
          "location",
          "origins",
          "sales",
          "trash",
        ].includes(id)
          ? id
          : "products",
      );
      const tab = new URL(window.location.href).searchParams.get("menuType");
      setType(tab === "drink" || tab === "dressing" ? tab : "salad");
    };
    queueMicrotask(() => {
      restore();
      setNavigationReady(true);
    });
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);
  useEffect(() => {
    if (!navigationReady) return;
    const url = new URL(window.location.href);
    url.hash = view;
    url.searchParams.set("menuType", type);
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, "", url);
  }, [view, type, navigationReady]);
  const stateRef = useRef(snapshot);
  useEffect(() => {
    stateRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool?: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of [
      {
        name: "read_salad_catalog",
        title: "메뉴와 옵션 확인",
        description:
          "현재 관리자 화면의 저장된 메뉴, 옵션과 고객 페이지 문구를 읽습니다. 저장이나 수정은 하지 않습니다.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (input: unknown) => {
          if (!input || typeof input !== "object" || Object.keys(input).length)
            throw Error("입력은 빈 객체여야 합니다.");
          if (!stateRef.current) throw Error("데이터를 불러오는 중입니다.");
          return stateRef.current;
        },
      },
      {
        name: "start_salad_registration",
        title: "샐러드 등록 시작",
        description: "새 샐러드 등록 양식을 엽니다. 저장은 하지 않습니다.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== "object" || Object.keys(input).length)
            throw Error("입력은 빈 객체여야 합니다.");
          setView("products");
          setType("salad");
          setProduct(blankProduct("salad"));
          return { status: "form_opened" };
        },
      },
    ]) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [setProduct]);
  const catalog = snapshot?.catalog;
  const nav = [
    { id: "products", name: "메뉴 관리", icon: Leaf },
    { id: "options", name: "옵션 관리", icon: SlidersHorizontal },
    { id: "bowlmatch", name: "bowl match 관리", icon: Leaf },
    { id: "content", name: "고객 페이지 편집", icon: LayoutTemplate },
    { id: "sales", name: "제품 판매 현황", icon: BarChart3 },
    { id: "reviews", name: "고객 리뷰 관리", icon: MessageSquare },
    { id: "location", name: "위치 및 배달 관리", icon: MapPin },
    { id: "origins", name: "원산지 및 알레르기 관리", icon: Leaf },
    { id: "trash", name: "휴지통", icon: Trash2 },
  ];
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="brand">leaf & bowl</div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">고객 페이지 관리</div>
          <SidebarMenu>
            {nav.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  isActive={navigationReady && view === n.id}
                  onClick={() => {
                    if (n.id === "products" && view !== "products") {
                      setType("salad");
                    }
                    if (n.id === "reviews" && view !== "reviews") {
                      const url = new URL(window.location.href);
                      url.searchParams.set("reviewType", "all");
                      window.history.replaceState(
                        window.history.state,
                        "",
                        url,
                      );
                    }
                    setView(n.id);
                  }}
                >
                  <n.icon />
                  <span>{n.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-note">
            <Leaf size={20} />
            <div>
              신선한 한 끼를 위한
              <br />
              작은 관리 공간.
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <SidebarTrigger />
          <div className="topbar-end">
            <div className="admin-account-links">
              <Button variant="ghost" asChild>
                <Link href="/admin/login" prefetch={false}>
                  관리자 로그인
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/logout" prefetch={false}>
                  로그아웃
                </Link>
              </Button>
            </div>
            <Button
              variant="outline"
              disabled={!catalog}
              onClick={() => setPreview(true)}
            >
              <Eye size={16} /> 고객 미리보기
            </Button>
          </div>
        </header>
        <main className="workspace">
          {loadError ? (
            <section className="surface">
              <p role="alert" className="error">
                {loadError}
              </p>
              <Button onClick={load}>다시 불러오기</Button>
            </section>
          ) : !catalog ? (
            <section className="surface" aria-live="polite">
              메뉴를 불러오는 중입니다…
            </section>
          ) : (
            <>
              {view === "products" && (
                <ProductsPanel
                  catalog={catalog}
                  busy={busy}
                  type={type}
                  setType={setType}
                  setProduct={setProduct}
                  setDeleting={setDeleting}
                  save={save}
                />
              )}
              {view === "options" && (
                <OptionsPanel
                  catalog={catalog}
                  busy={busy}
                  setGroup={setGroup}
                  setDeleting={setDeleting}
                />
              )}
              {view === "sales" && <SalesRanking />}
              {view === "location" && (
                <LocationManager catalog={catalog} busy={busy} onSave={save} />
              )}
              {view === "reviews" && (
                <ReviewManager catalog={catalog} busy={busy} onSave={save} />
              )}
              {view === "bowlmatch" && (
                <BowlMatchManager catalog={catalog} busy={busy} onSave={save} />
              )}
              {view === "content" && (
                <ContentEditor
                  catalog={catalog}
                  busy={busy}
                  onRefresh={load}
                  onSave={(c) => save({ ...catalog, content: c })}
                />
              )}
              {view === "origins" && (
                <OriginAllergyManager
                  catalog={catalog}
                  busy={busy}
                  onSave={save}
                />
              )}
              {view === "trash" && (
                <TrashPanel
                  catalog={catalog}
                  busy={busy}
                  setPurging={setPurging}
                  save={save}
                  action={action}
                />
              )}
            </>
          )}
        </main>
      </SidebarInset>
      {catalog && (
        <CatalogDialogs
          catalog={catalog}
          busy={busy}
          editors={editors}
          load={load}
          save={save}
          action={action}
        />
      )}
      <Toaster
        richColors
        position="bottom-right"
        style={
          {
            "--success-bg": "#194b38",
            "--success-text": "#f8f6ef",
            "--success-border": "#194b38",
            "--toast-close-button-start": "auto",
            "--toast-close-button-end": "0",
            "--toast-close-button-transform": "translate(35%, -35%)",
          } as React.CSSProperties
        }
        closeButton
      />
    </SidebarProvider>
  );
}
