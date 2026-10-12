import { readCatalog } from "@/application/catalog";
import { adminGate } from "@/application/admin-access";
import { readImage } from "@/infrastructure/images/files";
import { readEvents } from "@/application/events";
import { imageKeyPattern, catalogImageKeys, eventImageKeys } from "@/modules/images/references";
import { publicSnapshot } from "@/modules/catalog/public-snapshot";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!imageKeyPattern.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    await connection();
    const snapshot = await readCatalog();
    const published = publicSnapshot(snapshot).catalog;
    const content = published.content;
    const visible = {
      ...published,
      content: {
        ...content,
        mainImage: content.bannerVisible ? content.mainImage : "",
        mainMobileImage: content.bannerVisible ? content.mainMobileImage : "",
        heroImage: content.bannerVisible ? content.heroImage : "",
        heroMobileImage: content.bannerVisible ? content.heroMobileImage : "",
        seasonImage: content.seasonVisible ? content.seasonImage : "",
        seasonPages: content.seasonVisible ? content.seasonPages : [],
      },
    };
    // 고객 이벤트 목록(/event)에 보이는 이벤트 배너도 공개 이미지로 취급한다.
    if (
      !catalogImageKeys(visible).has(key) &&
      !eventImageKeys((await readEvents()).events.filter((event) => event.visible)).has(key)
    ) {
      const denied = await adminGate(request);
      if (denied) {
        return new Response("Image unavailable", {
          status: denied.status === 503 ? 503 : 404,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    const bytes = await readImage(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") ? "image/jpeg" : "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    unstable_rethrow(e);
    return new Response("Image unavailable", {
      status: (e as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
