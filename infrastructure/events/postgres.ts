import "server-only";
import { prisma } from "@/infrastructure/database/prisma";
import { eventsSchema, type EventSnapshot } from "@/modules/events/schema";

export async function readEvents(): Promise<EventSnapshot> {
  const row = await prisma().adminEventSettings.findUniqueOrThrow({ where: { id: 1 } });
  return { events: eventsSchema.parse(row.events), revision: row.revision };
}
