import "server-only";
import { connection } from "next/server";
import { readCatalog } from "@/application/catalog";
import { customerCatalog } from "@/modules/catalog/customer-view";
export async function readCustomerCatalog() {
  await connection();
  return customerCatalog(await readCatalog());
}
