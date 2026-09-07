import "server-only";

import { getDatabase } from "@/platform/db/client";
import { DestructionService } from "./destruction-service";
import { PostgresDestructionAdapter } from "./postgres-destruction-adapter";

export type RuntimeDestruction = Readonly<{ repository: PostgresDestructionAdapter; service: DestructionService }>;

export function getRuntimeDestruction(): RuntimeDestruction | null {
  try {
    const repository = new PostgresDestructionAdapter(getDatabase());
    return { repository, service: new DestructionService(repository.commandHandler()) };
  } catch { return null; }
}

export async function loadRuntimeDestruction<T>(loader: (runtime: RuntimeDestruction) => Promise<T>) {
  const runtime = getRuntimeDestruction();
  if (!runtime) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(runtime) }; }
  catch { return { state: "error" as const }; }
}
