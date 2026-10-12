import "server-only";
import { prisma, databaseTransaction } from "@/infrastructure/database/prisma";
import { eventsSchema, type ManagedEvent, type EventSnapshot } from "@/modules/events/schema";
import { AppError } from "@/modules/shared/errors";

export async function readEvents(): Promise<EventSnapshot> {
  const row = await prisma().adminEventSettings.findUniqueOrThrow({ where: { id: 1 } });
  return { events: eventsSchema.parse(row.events), revision: row.revision };
}

export async function writeEvents(events: ManagedEvent[], revision: number): Promise<EventSnapshot> {
  return databaseTransaction(prisma(), async (tx) => {
    const result = await tx.adminEventSettings.updateMany({
      where: { id: 1, revision },
      data: { events, revision: { increment: 1 } },
    });
    if (!result.count) {
      throw new AppError(
        409,
        "다른 관리자가 이벤트를 수정했습니다. 현재 입력 내용을 보관한 뒤 최신 목록을 불러와주세요.",
      );
    }
    return { events, revision: revision + 1 };
  });
}
