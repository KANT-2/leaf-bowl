"use client";
import { useState } from "react";
import type { Product, OptionGroup } from "@/lib/admin/catalog";
export function useCatalogEditors() {
  const [product, setProduct] = useState<Product | null>(null);
  const [group, setGroup] = useState<OptionGroup | null>(null);
  const [deleting, setDeleting] = useState<{
    kind: "product" | "group";
    id: string;
    name: string;
  } | null>(null);
  const [purging, setPurging] = useState<{
    kind: string;
    id: string;
    name: string;
  } | null>(null);
  const [preview, setPreview] = useState(false);
  return {
    product,
    setProduct,
    group,
    setGroup,
    deleting,
    setDeleting,
    purging,
    setPurging,
    preview,
    setPreview,
  };
}
export type CatalogEditors = ReturnType<typeof useCatalogEditors>;
