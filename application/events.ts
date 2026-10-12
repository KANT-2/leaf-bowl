import "server-only";
import { prisma, databaseTransaction } from "@/infrastructure/database/prisma";
import { eventsSchema, type ManagedEvent, type EventSnapshot } from "@/modules/events/schema";
import { AppError } from "@/modules/shared/errors";
import { lockCatalog } from "@/infrastructure/catalog/postgres";
import { eventImageKeys } from "@/modules/images/references";
import { maintainImages, validateNewImageKeys } from "@/application/images";

import { readEvents as readEventsRow } from "@/infrastructure/events/postgres";

/** 테스트에서 바꿔 끼울 수 있도록 재수출 대신 함수로 감싼다. */
export function readEvents(): Promise<EventSnapshot> {
  return readEventsRow();
}

export async function writeEvents(events: ManagedEvent[], revision: number): Promise<EventSnapshot> {
  const removed = await databaseTransaction(prisma(), async (tx) => {
    await lockCatalog(tx, "write");
    const current = await tx.adminEventSettings.findUniqueOrThrow({ where: { id: 1 } });
    if (current.revision !== revision) {
      throw new AppError(409, "다른 관리자가 이벤트를 수정했습니다. 최신 목록을 불러와주세요.");
    }
    const previous = eventImageKeys(eventsSchema.parse(current.events));
    const next = eventImageKeys(events);
    await validateNewImageKeys(previous, next);
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
    return [...previous].filter((key) => !next.has(key));
  });
  await maintainImages(removed);
  return { events, revision: revision + 1 };
}
