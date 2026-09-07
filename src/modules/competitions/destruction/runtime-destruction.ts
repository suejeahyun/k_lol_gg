import "server-only";

import type { DestructionQueryPort } from "./http-contract";
import type { DestructionService } from "./destruction-service";

export type RuntimeDestruction = Readonly<{
  repository: DestructionQueryPort;
  service: DestructionService;
}>;

/** PostgreSQL binding is intentionally deferred to migration 0013. */
export function getRuntimeDestruction(): RuntimeDestruction | null {
  return null;
}

export async function loadRuntimeDestruction<T>(loader: (runtime: RuntimeDestruction) => Promise<T>) {
  const runtime = getRuntimeDestruction();
  if (!runtime) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(runtime) }; }
  catch { return { state: "error" as const }; }
}
