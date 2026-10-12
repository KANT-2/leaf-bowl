import { services } from "@/application/container";
import { readEvents, writeEvents } from "@/application/events";
import { requireAdmin } from "@/modules/identity/guard";
import { eventUpdateSchema } from "@/modules/events/schema";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/infrastructure/http/response";

export async function GET(request: Request) {
  return run(async () => {
    await requireAdmin(request, services().identity);
    return jsonResponse(await readEvents());
  });
}

export async function PUT(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    await requireAdmin(request, services().identity);
    const input = parseOrThrow(
      eventUpdateSchema,
      await readJsonBody(request, 512_000),
      "이벤트 입력 내용을 확인해주세요.",
    );
    return jsonResponse(await writeEvents(input.events, input.revision));
  });
}
