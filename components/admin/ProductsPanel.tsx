"use client";
import { Button } from "@/components/admin/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/admin/tabs";
import {
  money,
  saladCategories,
  type Catalog,
  type Product,
} from "@/lib/admin/catalog";
import {
  blankProduct,
  hasDressingOption,
  hasDrinkOption,
  statusNames,
} from "@/lib/admin/editor-helpers";
import { CupSoda, Leaf, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import CategoryManager from "./editors/CategoryManager";
import { Photo } from "./editors/EditorFields";
export default function ProductsPanel({
  catalog,
  busy,
  type,
  setType,
  setProduct,
  setDeleting,
  save,
}: {
  catalog: Catalog;
  busy: boolean;
  type: Product["type"];
  setType: (type: Product["type"]) => void;
  setProduct: (value: Product) => void;
  setDeleting: (value: {
    kind: "product" | "group";
    id: string;
    name: string;
  }) => void;
  save: (catalog: Catalog, message?: string) => Promise<void>;
}) {
  const [menuPage, setMenuPage] = useState(1);
  const menuItems = catalog.products.filter(
    (p) => !p.deleted && p.type === type,
  );
  const pageCount = Math.max(1, Math.ceil(menuItems.length / 8));
  const currentPage = Math.min(menuPage, pageCount);
  const pagedMenus = menuItems.slice((currentPage - 1) * 8, currentPage * 8);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MENU COLLECTION</div>
          <h1>메뉴 관리</h1>
          <p className="muted">
            샐러드, 음료와 드레싱의 가격 및 판매 상태를 관리하세요.
          </p>
        </div>
        <Button
          onClick={() =>
            setProduct({
              ...blankProduct(type),
              ...(type === "salad" && catalog
                ? { category: saladCategories(catalog)[0] }
                : {}),
            })
          }
          disabled={busy}
        >
          <Plus size={18} />
          {type === "salad"
            ? "샐러드"
            : type === "dressing"
              ? "드레싱"
              : "음료"}{" "}
          등록
        </Button>
      </div>
      <div className="toolbar">
        <Tabs
          className="menu-type-tabs"
          value={type}
          onValueChange={(v) => {
            setType(v as Product["type"]);
            setMenuPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="salad">
              <Leaf size={16} />
              샐러드{" "}
              {
                catalog.products.filter((p) => p.type === "salad" && !p.deleted)
                  .length
              }
            </TabsTrigger>
            <TabsTrigger value="drink">
              <CupSoda size={16} />
              음료{" "}
              {
                catalog.products.filter((p) => p.type === "drink" && !p.deleted)
                  .length
              }
            </TabsTrigger>
            <TabsTrigger value="dressing">
              <Leaf size={16} />
              드레싱{" "}
              {
                catalog.products.filter(
                  (p) => p.type === "dressing" && !p.deleted,
                ).length
              }
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {type === "salad" && (
        <CategoryManager catalog={catalog} busy={busy} onSave={save} />
      )}
      <section className="surface menu-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>메뉴</TableHead>
              <TableHead>가격</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedMenus.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="product-cell">
                    <Photo src={p.image} name={p.name} />
                    <div>
                      <div className="product-name">
                        {p.name}{" "}
                        {p.badge && <span className="pill">{p.badge}</span>}{" "}
                        {p.type === "salad" &&
                          !hasDressingOption(p, catalog.groups) && (
                            <span className="dressing-excluded">
                              드레싱 선택 제외
                            </span>
                          )}{" "}
                        {p.type === "salad" &&
                          !hasDrinkOption(p, catalog.groups) && (
                            <span className="dressing-excluded">
                              음료 선택 제외
                            </span>
                          )}
                      </div>
                      <div className="meta">{p.category}</div>
                      <div className="ingredient">{p.description}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="price">{money(p.price)}</TableCell>
                <TableCell>
                  <span className={"status-tag " + p.status}>
                    {statusNames[p.status]}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="row-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setProduct(structuredClone(p))}
                    >
                      <Pencil size={14} />
                      <span>수정</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={p.name + " 삭제"}
                      disabled={busy}
                      onClick={() =>
                        setDeleting({
                          kind: "product",
                          id: p.id,
                          name: p.name,
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!catalog.products.some((p) => !p.deleted && p.type === type) && (
          <div className="empty">
            등록된 메뉴가 없습니다. 첫 메뉴를 추가해주세요.
          </div>
        )}
      </section>
      {menuItems.length > 0 && (
        <div className="menu-pagination">
          <nav aria-label="메뉴 목록 페이지">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setMenuPage(currentPage - 1)}
            >
              이전
            </Button>
            {Array.from({ length: pageCount }, (_, i) => (
              <Button
                key={i}
                type="button"
                variant={currentPage === i + 1 ? "default" : "outline"}
                size="sm"
                aria-label={i + 1 + "페이지"}
                aria-current={currentPage === i + 1 ? "page" : undefined}
                onClick={() => setMenuPage(i + 1)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setMenuPage(currentPage + 1)}
            >
              다음
            </Button>
          </nav>
        </div>
      )}
    </>
  );
}
