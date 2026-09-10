import "server-only";

import { getDatabase } from "@/platform/db/client";

import { PostgresKakaoAssistant } from "./postgres-kakao-assistant";

/** Text-only Kakao runtime kept separate from private image/Sharp dependencies. */
export function getRuntimeKakaoAssistant() {
  try { return new PostgresKakaoAssistant(getDatabase()); } catch { return null; }
}
