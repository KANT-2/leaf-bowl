/** TLS proxies can replace Host and scheme; accept the explicitly configured public origin. */
export function sameOrigin(request: Request) {
    if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
    const origin = request.headers.get('origin');
    if (!origin) return true;
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (origin === url.origin || (!!host && origin === url.protocol + '//' + host)) return true;
    try {
        const configured = new URL(process.env.APP_ORIGIN ?? '');
        return ['https:', 'http:'].includes(configured.protocol) && !configured.username && !configured.password &&
            configured.pathname === '/' && !configured.search && !configured.hash && origin === configured.origin;
    } catch { return false; }
}
export function jsonError(message: string, status = 400) { return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } }); }
export class BodyTooLarge extends Error {
}
export async function readLimited(request: Request, max: number) { const chunks: Uint8Array[] = []; let size = 0; const reader = request.body?.getReader(); if (!reader)
    return new Uint8Array(); try {
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.byteLength;
        if (size > max) {
            await reader.cancel();
            throw new BodyTooLarge();
        }
        chunks.push(value);
    }
}
finally {
    reader.releaseLock();
} const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
} return bytes; }
