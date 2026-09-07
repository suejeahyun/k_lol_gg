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

const SAFE_FIXTURE_STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,254}$/u;

function browserQaFixture(): readonly (readonly [string, Uint8Array])[] | null {
  const raw = process.env.V2_BROWSER_QA_PRIVATE_IMAGE_FIXTURE;
  if (!raw) return [];
  if (raw.length > 6_000_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "bytesBase64url,storageKey") return null;
    if (typeof record.storageKey !== "string" || !SAFE_FIXTURE_STORAGE_KEY.test(record.storageKey)) return null;
    if (typeof record.bytesBase64url !== "string" || !/^[A-Za-z0-9_-]+$/u.test(record.bytesBase64url)) return null;
    const bytes = Buffer.from(record.bytesBase64url, "base64url");
    if (!bytes.length || bytes.length > 4 * 1024 * 1024 || bytes.toString("base64url") !== record.bytesBase64url) return null;
    return [[record.storageKey, Uint8Array.from(bytes)]];
  } catch {
    return null;
  }
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
  if (mode === "FAKE_LOCAL") {
    const fixture = browserQaFixture();
    if (!fixture) return null;
    storage = new FakePrivateImageStorage(fixture);
  }
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
