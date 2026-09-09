import { getDatabase } from "@/platform/db/client";
import { PostgresKakaoRoomRegistry } from "./postgres-kakao-room-registry";

export function getRuntimeKakaoRoomRegistry() {
  try { return new PostgresKakaoRoomRegistry(getDatabase()); } catch { return null; }
}
