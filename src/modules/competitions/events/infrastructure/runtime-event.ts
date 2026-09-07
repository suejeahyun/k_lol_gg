import "server-only";

import { getDatabase } from "@/platform/db/client";
import { EventService } from "../application/event-service";
import { PostgresEventAdapter } from "./postgres-event-adapters";

export function getRuntimeEvent() {
  try {
    const repository = new PostgresEventAdapter(getDatabase());
    return { repository, service: new EventService(repository.commandHandler()) };
  } catch {
    return null;
  }
}

export async function loadRuntimeEvent<T>(loader: (runtime: NonNullable<ReturnType<typeof getRuntimeEvent>>) => Promise<T>) {
  const runtime = getRuntimeEvent();
  if (!runtime) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(runtime) }; }
  catch { return { state: "error" as const }; }
}
