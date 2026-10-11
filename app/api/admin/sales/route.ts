import { connection } from 'next/server';
import { readCatalog } from '@/lib/admin/store';
import { readSalesData } from '@/lib/admin/sales-store';
import { buildSalesReport, salesPeriods, salesProductTypes, type SalesProductType, type SalesPeriod } from '@/lib/admin/sales';
import { jsonError } from '@/lib/admin/server';
import { adminGate } from '@/modules/identity/legacy-admin';

export async function GET(request: Request) {
  await connection();
  const denied = await adminGate(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const period = params.get('period') ?? 'all';
  const productType = params.get('type') ?? 'salad';
  if (!salesProductTypes.includes(productType as SalesProductType)) return jsonError('올바른 제품 분류를 선택해주세요.');
  if (!salesPeriods.includes(period as SalesPeriod)) return jsonError('올바른 조회 기간을 선택해주세요.');
  try {
    const [snapshot, data] = await Promise.all([readCatalog(), readSalesData()]);
    return Response.json(buildSalesReport(snapshot.catalog, data, period as SalesPeriod, new Date(), productType as SalesProductType), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Sales report read', error);
    return jsonError('판매 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 503);
  }
}
