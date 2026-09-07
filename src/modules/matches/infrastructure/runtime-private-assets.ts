import "server-only";

import {
  privateBlobToken,
  resolveRuntimePrivateStorageMode,
  type RuntimePrivateStorageMode,
} from "@/modules/assets/infrastructure/private-blob-storage-core";
import { createVercelBlobPrivateImageStorage } from "@/modules/assets/infrastructure/vercel-blob-private-image-storage";

import type { PrivateImageStorage, ScoreboardOcr } from "../application/ports/private-image-storage";
import { FakePrivateImageStorage, FakeScoreboardOcr } from "./private-image";

type RuntimePrivateAdapters = Readonly<{
  storage: PrivateImageStorage;
  ocr: ScoreboardOcr | null;
}>;

declare global {
  var __klolV2PrivateImageStorageState: Readonly<{
    mode: Exclude<RuntimePrivateStorageMode, "UNAVAILABLE">;
    storage: PrivateImageStorage;
  }> | undefined;
  var __klolV2FakeScoreboardOcr: ScoreboardOcr | undefined;
}

/** Common fail-closed storage selection for matches, discipline, and media. */
export function getRuntimePrivateImageStorage(): PrivateImageStorage | null {
  const mode = resolveRuntimePrivateStorageMode();
  if (mode === "UNAVAILABLE") return null;
  if (globalThis.__klolV2PrivateImageStorageState?.mode === mode) {
    return globalThis.__klolV2PrivateImageStorageState.storage;
  }
  const token = privateBlobToken(process.env);
  let storage: PrivateImageStorage;
  if (mode === "FAKE_LOCAL") storage = new FakePrivateImageStorage();
  else {
    if (!token) return null;
    storage = createVercelBlobPrivateImageStorage(token);
  }
  globalThis.__klolV2PrivateImageStorageState = { mode, storage };
  return storage;
}

export function getRuntimePrivateAdapters(): RuntimePrivateAdapters | null {
  const mode = resolveRuntimePrivateStorageMode();
  const storage = getRuntimePrivateImageStorage();
  if (!storage) return null;
  if (mode === "FAKE_LOCAL" && !globalThis.__klolV2FakeScoreboardOcr) {
    globalThis.__klolV2FakeScoreboardOcr = new FakeScoreboardOcr();
  }
  return {
    storage,
    ocr: mode === "FAKE_LOCAL" ? globalThis.__klolV2FakeScoreboardOcr ?? null : null,
  };
}
