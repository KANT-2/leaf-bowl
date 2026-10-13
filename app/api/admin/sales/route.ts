import { connection } from "next/server";
import { readCatalog } from "@/application/catalog";
import { readSalesData } from "@/application/sales";
import {
  buildSalesReport,
  salesPeriods,
  salesDateRangeSchema,
  salesProductTypes,
  type SalesProductType,
  type SalesPeriod,
} from "@/modules/reports/sales";
import { jsonError } from "@/infrastructure/http/request";
import { adminGate } from "@/application/admin-access";

export async function GET(request: Request) {
  await connection();
  const denied = await adminGate(request);
  if (denied) {
    return denied;
  }
  const params = new URL(request.url).searchParams;
  const period = params.get("period") ?? "all";
  const productType = params.get("type") ?? "salad";
  if (!salesProductTypes.includes(productType as SalesProductType)) {
    return jsonError("올바른 제품 분류를 선택해주세요.");
  }
  if (!salesPeriods.includes(period as SalesPeriod)) {
    return jsonError("올바른 조회 기간을 선택해주세요.");
  }
  const range = salesDateRangeSchema.safeParse({ startDate: params.get("startDate"), endDate: params.get("endDate") });
  if (period === "custom" && !range.success) {
    return jsonError("시작일과 종료일을 올바르게 선택해주세요. 종료일은 시작일 이후여야 합니다.");
  }
  try {
    const [snapshot, data] = await Promise.all([readCatalog(), readSalesData()]);
    return Response.json(
      buildSalesReport(
        snapshot.catalog,
        data,
        period as SalesPeriod,
        new Date(),
        productType as SalesProductType,
        period === "custom" && range.success ? range.data : undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Sales report read", error);
    return jsonError("판매 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
  }
}
