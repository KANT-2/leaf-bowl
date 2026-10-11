import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { publicSnapshot } from "@/lib/customer/catalog";
import { z } from "zod";
import { appendCustomerReview, dataDirectory } from "@/lib/admin/store";
import {
  sameOrigin,
  readLimited,
  BodyTooLarge,
  jsonError,
} from "@/lib/admin/server";
const schema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(80),
  pid: z.number().int().nonnegative(),
  author: z.string().trim().min(1).max(80),
  stars: z.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(200),
  text: z.string().trim().min(10).max(10000),
  via: z.enum(["pickup", "delivery"]),
  /** 브라우저에서 줄인 사진 (data: 주소), 최대 3장 */
  photos: z.array(z.string().max(1_500_000)).max(3).optional(),
});

/** 리뷰 사진 한 장 용량 한도 (줄인 뒤 기준) */
const PHOTO_MAX_BYTES = 1024 * 1024;

/** data: 주소를 검사해 [바이트, 확장자]로 바꾼다. 파일 내용이 PNG·JPEG·WebP 가 아니면 null */
function decodePhoto(dataUrl: string): [Uint8Array, string] | null {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) return null;
  const png = bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const ext = png ? "png" : jpeg ? "jpg" : webp ? "webp" : null;
  return ext ? [bytes, ext] : null;
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("허용되지 않은 요청입니다.", 403);
  try {
    const body = JSON.parse(
      new TextDecoder().decode(await readLimited(request, 5 * 1024 * 1024)),
    );
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError("리뷰 내용을 확인해주세요.");
    const { photos = [], ...review } = parsed.data;
    const decoded = photos.map(decodePhoto);
    if (decoded.some((d) => d === null))
      return jsonError("사진은 JPG·PNG·WebP, 장당 1MB 이하로 올려주세요.");
    // 사진은 관리자 이미지와 같은 폴더에 저장하고, 리뷰에는 주소만 남긴다.
    const directory = path.join(dataDirectory(), "images");
    const saved: string[] = [];
    let referenced = new Set<string>();
    try {
      if (decoded.length) await mkdir(directory, { recursive: true });
      for (const d of decoded) {
        const [bytes, ext] = d!;
        const key = `review-${crypto.randomUUID()}.${ext}`;
        saved.push(key);
        await writeFile(path.join(directory, key), bytes);
      }
      const snapshot = await appendCustomerReview({
        ...review,
        images: saved.map((key) => "/api/admin/images/" + key),
      });
      // 중복·삭제된 ID는 저장소가 성공 응답으로 무시한다. 그 요청의 새 사진은 참조되지 않는다.
      referenced = new Set((snapshot.catalog.reviews ?? []).flatMap((r) => r.images ?? []));
      await Promise.all(saved.filter((key) => !referenced.has("/api/admin/images/" + key)).map((key) => rm(path.join(directory, key), { force: true })));
      return Response.json(publicSnapshot(snapshot), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (e) {
      // 리뷰 저장에 실패하면 먼저 써 둔 사진 파일도 지운다.
      await Promise.all(saved.filter((key) => !referenced.has("/api/admin/images/" + key)).map((key) => rm(path.join(directory, key), { force: true })));
      throw e;
    }
  } catch (e) {
    if (e instanceof BodyTooLarge) return jsonError("리뷰가 너무 큽니다.", 413);
    return jsonError("리뷰를 저장하지 못했습니다. 다시 시도해주세요.", 503);
  }
}
