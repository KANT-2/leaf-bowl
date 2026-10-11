import { connection } from 'next/server';
import { z } from 'zod';
import { catalogSchema } from '@/lib/admin/catalog';
import { readCatalog, writeCatalog } from '@/lib/admin/store';
import { jsonError, sameOrigin, readLimited, BodyTooLarge } from '@/lib/admin/server';
import { adminGate } from '@/modules/identity/legacy-admin';

export async function GET(request: Request) { await connection(); const denied = await adminGate(request); if (denied)
    return denied; try {
    return Response.json(await readCatalog(), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    console.error('Catalog read', e);
    return jsonError('메뉴를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 503);
} }
export async function PUT(request: Request) { if (!sameOrigin(request))
    return jsonError('허용되지 않은 요청입니다.', 403); const denied = await adminGate(request); if (denied)
    return denied; try {
    const raw = new TextDecoder().decode(await readLimited(request, 512000));
    if (raw.length > 512000)
        return jsonError('저장할 데이터가 너무 큽니다.', 413);
    let body;
    try {
        body = JSON.parse(raw);
    }
    catch {
        return jsonError('올바른 JSON이 아닙니다.');
    }
    const parsed = z.object({ catalog: catalogSchema, revision: z.number().int().positive() }).safeParse(body);
    if (!parsed.success)
        return jsonError(parsed.error.issues[0].message);
    const previous = await readCatalog();
    const now = new Date().toISOString();
    if(parsed.data.catalog.reviews)parsed.data.catalog.reviews=parsed.data.catalog.reviews.map(review=>{
        const existing=previous.catalog.reviews?.find(r=>r.id===review.id);
        return {...review,createdAt:existing?existing.createdAt??review.createdAt:now};
    });
    const result = await writeCatalog(parsed.data.catalog, parsed.data.revision);
    if (!result)
        return jsonError('다른 화면에서 데이터가 변경되었습니다. 최신 내용을 불러온 뒤 다시 저장해주세요.', 409);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    if (e instanceof BodyTooLarge)
        return jsonError('저장할 데이터가 너무 큽니다.', 413);
    console.error('Catalog save', e);
    return jsonError('저장하지 못했습니다. 입력한 내용을 유지하고 있으니 다시 시도해주세요.', 503);
} }
