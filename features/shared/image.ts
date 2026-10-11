/**
 * 올린 사진을 긴 변 max px 이하의 JPEG data: 주소로 줄인다 (브라우저 저장 공간을 아끼기 위해).
 * 브라우저가 읽을 수 없는 형식(예: 일부 HEIC)이면 실패한다.
 */
export async function shrinkImage(
  file: File,
  max = 1080,
  quality = 0.82,
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not-image");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  // 투명한 PNG 도 JPEG 로 바꾸면 검게 나오지 않도록 흰 바탕을 깐다.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
