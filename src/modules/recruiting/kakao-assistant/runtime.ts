import "server-only";

import { getDatabase } from "@/platform/db/client";

import { PostgresKakaoAssistant } from "./postgres-kakao-assistant";

export function getRuntimeKakaoAssistant() {
  try { return new PostgresKakaoAssistant(getDatabase()); } catch { return null; }
}
