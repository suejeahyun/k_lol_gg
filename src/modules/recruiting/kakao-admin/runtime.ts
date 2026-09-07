import "server-only";

import { getDatabase } from "@/platform/db/client";
import { PostgresKakaoAdmin } from "./postgres-kakao-admin";
import { isKakaoOperationMessageAllowed, type KakaoFeature } from "./domain";

export function getRuntimeKakaoAdmin() {
  try { return new PostgresKakaoAdmin(getDatabase()); } catch { return null; }
}

export async function isRuntimeKakaoFeatureEnabled(feature: KakaoFeature, operationMessage?: string) {
  const runtime = getRuntimeKakaoAdmin();
  if (!runtime) return false;
  try {
    const settings = await runtime.getSettings();
    return settings.globalEnabled && !settings.maintenanceMode && settings[feature] &&
      (operationMessage === undefined || isKakaoOperationMessageAllowed(operationMessage, settings.maxMessageLength));
  } catch { return false; }
}

export async function loadRuntimeKakaoAdmin<T>(loader: (runtime: PostgresKakaoAdmin) => Promise<T>) {
  const runtime = getRuntimeKakaoAdmin();
  if (!runtime) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(runtime) }; }
  catch { return { state: "error" as const }; }
}
