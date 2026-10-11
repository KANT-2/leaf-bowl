import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDirectory } from '@/lib/admin/store';
import { jsonError, sameOrigin, readLimited, BodyTooLarge } from '@/lib/admin/server';
import { adminGate } from '@/modules/identity/legacy-admin';
export async function POST(request: Request) { if (!sameOrigin(request))
    return jsonError('허용되지 않은 요청입니다.', 403); const denied = await adminGate(request); if (denied)
    return denied; try {

    if (Number(request.headers.get('content-length')) > 6 * 1024 * 1024)
        return jsonError('이미지는 5MB 이하로 올려주세요.', 413);
    const raw = await readLimited(request, 6 * 1024 * 1024);
    const form = await new Response(raw.buffer as ArrayBuffer, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const file = form.get('file');
    if (!(file instanceof File))
        return jsonError('이미지를 선택해주세요.');
    if (file.size > 5 * 1024 * 1024)
        return jsonError('이미지는 5MB 이하로 올려주세요.', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
    const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    const ext = png ? 'png' : jpeg ? 'jpg' : webp ? 'webp' : null;
    if (!ext)
        return jsonError('PNG, JPEG, WebP 이미지만 올릴 수 있습니다.');
    const key = crypto.randomUUID() + '.' + ext;
    const directory=path.join(dataDirectory(),'images');await mkdir(directory,{recursive:true});await writeFile(path.join(directory,key),bytes);
    return Response.json({ url: '/api/admin/images/' + key });
}
catch (e) {
    if (e instanceof BodyTooLarge)
        return jsonError('이미지는 5MB 이하로 올려주세요.', 413);
    console.error('Image upload', e);
    return jsonError('이미지를 올리지 못했습니다. 다시 시도해주세요.', 503);
} }
