import "server-only";
import { randomUUID } from "node:crypto";
import { access, mkdir, opendir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "@/modules/shared/errors";
import { imageKeyPattern } from "@/modules/images/references";

export const dataDirectory = () => process.env.ADMIN_DATA_DIR || path.resolve(process.cwd(), ".data/admin");
export const IMAGE_DRAFT_TTL_MS = 24 * 3600_000;
export const MAX_IMAGE_PIXELS = 16_000_000;
const imageDirectory = () => path.join(dataDirectory(), "images");

const legacyDirectory = () => path.join(process.cwd(), "public/admin-assets/uploads");
let decoding = 0;

/** Full decode/re-encode strips metadata/trailing payloads and rejects truncated/animated/oversized images. */
export async function normalizeImage(bytes: Uint8Array, maxBytes: number) {
  if (!bytes.length || bytes.length > maxBytes) {
    throw new AppError(bytes.length ? 413 : 400, "이미지 용량을 확인해주세요.");
  }
  if (decoding >= 2) {
    throw new AppError(429, "이미지를 처리 중입니다. 잠시 후 다시 시도해주세요.");
  }
  decoding += 1;
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS, sequentialRead: true });
    const metadata = await image.metadata();
    const format = metadata.format;
    if (
      !["png", "jpeg", "webp"].includes(format ?? "") ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS
    ) {
      throw new AppError(400, "정상적인 PNG·JPEG·WebP 정지 이미지(최대 1600만 픽셀)를 선택해주세요.");
    }
    const output = await image
      .rotate()
      .toFormat(format as "png" | "jpeg" | "webp")
      .timeout({ seconds: 5 })
      .toBuffer();
    if (output.length > maxBytes) {
      throw new AppError(413, "처리한 이미지가 너무 큽니다. 크기를 줄여 다시 올려주세요.");
    }
    return { bytes: output, ext: format === "jpeg" ? "jpg" : format! };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(400, "손상되었거나 지원하지 않는 이미지입니다. PNG·JPEG·WebP 파일을 확인해주세요.");
  } finally {
    decoding -= 1;
  }
}

/** A partially written file never becomes a public image. */
export async function saveImage(image: { bytes: Uint8Array; ext: string }, prefix = "") {
  const key = prefix + randomUUID() + "." + image.ext;
  if (!imageKeyPattern.test(key)) {
    throw new Error("Invalid generated image key");
  }
  await mkdir(imageDirectory(), { recursive: true });
  const temporary = path.join(imageDirectory(), key + "." + randomUUID() + ".tmp");
  try {
    await writeFile(temporary, image.bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, path.join(imageDirectory(), key));
    return key;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readImage(key: string) {
  if (!imageKeyPattern.test(key)) {
    throw new AppError(404, "이미지를 찾을 수 없습니다.");
  }
  return readFile(path.join(imageDirectory(), key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return readFile(path.join(legacyDirectory(), key));
  });
}

export async function imageExists(key: string) {
  if (!imageKeyPattern.test(key)) {
    return false;
  }
  try {
    await access(path.join(imageDirectory(), key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
      return access(path.join(legacyDirectory(), key));
    });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function removeImage(key: string) {
  if (!imageKeyPattern.test(key)) {
    throw new Error("Invalid image key");
  }
  // Legacy public assets belong to the release and are never removed by runtime GC.
  await rm(path.join(imageDirectory(), key), { force: true });
}

/** Bounded maintenance pass. Only runtime image/temp files are eligible. */
export async function expiredImageFiles(now = Date.now(), limit = 2000, retained: ReadonlySet<string> = new Set()) {
  const files: string[] = [];
  let directory;
  try {
    directory = await opendir(imageDirectory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return files;
    }
    throw error;
  }
  for await (const entry of directory) {
    if (retained.has(entry.name)) {
      continue;
    }
    if (!entry.isFile() || (!imageKeyPattern.test(entry.name) && !/^[a-zA-Z0-9_.-]+\.tmp$/.test(entry.name))) {
      continue;
    }
    const info = await stat(path.join(imageDirectory(), entry.name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
      return null;
    });
    if (info && now - info.mtimeMs >= IMAGE_DRAFT_TTL_MS) {
      files.push(entry.name);
      if (files.length >= limit) {
        break;
      }
    }
  }
  return files;
}

export async function removeExpiredFile(key: string) {
  if (!imageKeyPattern.test(key) && !/^[a-zA-Z0-9_.-]+\.tmp$/.test(key)) {
    throw new Error("Invalid maintenance key");
  }
  await rm(path.join(imageDirectory(), key), { force: true });
}
