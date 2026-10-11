import "server-only";
import { readCatalog, mutateCatalog } from "@/lib/admin/store";
import { customerCatalog } from "@/lib/customer/catalog";
import type { Category, Product, ProductUpdate } from "@/types/product";

export const CATEGORIES: readonly Category[] = ["protein", "vegan", "new", "other"];
export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export async function findProducts(category?: Category): Promise<Product[]> {
  const products = customerCatalog(await readCatalog()).visibleProducts;
  return category ? products.filter(product => product.category === category) : products;
}

export async function findProductById(id: number): Promise<Product | undefined> {
  return customerCatalog(await readCatalog()).getProduct(id);
}

export async function updateProduct(id: number, changes: ProductUpdate): Promise<Product | undefined> {
  const saved = await mutateCatalog(catalog => {
    const product = catalog.products.find(product => product.type === "salad" && product.customerId === id && !product.deleted && product.status !== "hidden");
    if (!product) return null;
    if (changes.name !== undefined) product.name = changes.name;
    if (changes.description !== undefined) product.description = changes.description;
    if (changes.price !== undefined) product.price = changes.price;
    if (changes.isNew !== undefined) product.isNew = changes.isNew;
    if (changes.isOnSale !== undefined) product.status = changes.isOnSale ? "active" : "soldout";
    if ("tag" in changes) product.badge = changes.tag ?? "";
    return catalog;
  });
  return saved ? customerCatalog(saved).getProduct(id) : undefined;
}
