import "server-only";

import { getDatabase } from "@/platform/db/client";

import { PostgresOperationForms } from "./postgres-operation-forms";

export function getRuntimeOperationForms() {
  try { return new PostgresOperationForms(getDatabase()); } catch { return null; }
}

export async function loadRuntimeOperationForms<T>(loader: (service: PostgresOperationForms) => Promise<T>) {
  const service = getRuntimeOperationForms();
  if (!service) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(service) }; }
  catch { return { state: "error" as const }; }
}
