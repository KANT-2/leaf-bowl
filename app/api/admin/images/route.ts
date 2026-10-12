import { jsonError, sameOrigin, readLimited, BodyTooLarge } from "@/infrastructure/http/request";
import { adminGate } from "@/application/admin-access";
import { maintainImages } from "@/application/images";
import { normalizeImage, saveImage } from "@/infrastructure/images/files";
import { AppError } from "@/modules/shared/errors";
import { createRateLimiter } from "@/modules/shared/rate-limit";

const uploads = createRateLimiter(30, 60_000);

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError("허용되지 않은 요청입니다.", 403);
  }
  const denied = await adminGate(request);
  if (denied) {
    return denied;
  }
  try {
    uploads.hit("all");
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) {
      return jsonError("이미지는 5MB 이하로 올려주세요.", 413);
    }
    const raw = await readLimited(request, 6 * 1024 * 1024);
    let form: FormData;
    try {
      if (!/^multipart\/form-data(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
        throw new Error("Expected multipart");
      }
      form = await new Response(raw.buffer as ArrayBuffer, {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      return jsonError("업로드 요청 형식이 올바르지 않습니다.");
    }
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1) {
      return jsonError("이미지 한 장을 선택해주세요.");
    }
    if (file.size > 5 * 1024 * 1024) {
      return jsonError("이미지는 5MB 이하로 올려주세요.", 413);
    }
    const image = await normalizeImage(new Uint8Array(await file.arrayBuffer()), 5 * 1024 * 1024);
    if (request.signal.aborted) {
      throw new AppError(408, "업로드가 취소되었습니다.");
    }
    const key = await saveImage(image);
    await maintainImages();
    return Response.json({ url: "/api/admin/images/" + key }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BodyTooLarge) {
      return jsonError("이미지는 5MB 이하로 올려주세요.", 413);
    }
    if (e instanceof AppError) {
      return jsonError(e.message, e.status);
    }
    console.error("Image upload", e);
    return jsonError("이미지를 올리지 못했습니다. 다시 시도해주세요.", 503);
  }
}
