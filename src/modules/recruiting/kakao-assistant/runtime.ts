import "server-only";

import { getRuntimePrivateImageStorage } from "@/modules/matches/infrastructure/runtime-private-assets";
import { getDatabase } from "@/platform/db/client";

import { PostgresKakaoAssistant } from "./postgres-kakao-assistant";
import { PostgresKakaoImageReceive } from "./postgres-kakao-image-receive";

export function getRuntimeKakaoAssistant() {
  try { return new PostgresKakaoAssistant(getDatabase()); } catch { return null; }
}

export function getRuntimeKakaoImageReceive() {
  try {
    const storage = getRuntimePrivateImageStorage();
    return storage ? new PostgresKakaoImageReceive(getDatabase(), storage) : null;
  } catch { return null; }
}
