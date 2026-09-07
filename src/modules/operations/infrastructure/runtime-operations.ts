import "server-only";

import { getDatabase } from "@/platform/db/client";

import { DisabledAiCompletionAdapter, PostgresOperationsRepository } from "./postgres-operations-repository";

export function getRuntimeOperationsRepository() {
  try {
    return new PostgresOperationsRepository(getDatabase(), new DisabledAiCompletionAdapter());
  } catch {
    return null;
  }
}

export async function loadRuntimeOperations<T>(loader: (repository: PostgresOperationsRepository) => Promise<T>) {
  const repository = getRuntimeOperationsRepository();
  if (!repository) return { state: "unavailable" as const };
  try {
    return { state: "ready" as const, data: await loader(repository) };
  } catch {
    return { state: "error" as const };
  }
}
