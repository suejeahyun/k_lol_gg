import "server-only";

import { getRuntimePrivateImageStorage } from "@/modules/matches/infrastructure/runtime-private-assets";
import { getDatabase } from "@/platform/db/client";

import { PostgresKakaoImageReceive } from "./postgres-kakao-image-receive";

export function getRuntimeKakaoImageReceive() {
  try {
    const storage = getRuntimePrivateImageStorage();
    return storage ? new PostgresKakaoImageReceive(getDatabase(), storage) : null;
  } catch { return null; }
}
