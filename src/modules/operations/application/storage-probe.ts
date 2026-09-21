import { createHash } from "node:crypto";
import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export type StorageProbeResult = Readonly<{
  ok: boolean;
  counts: Readonly<{ uploaded: number; verified: number; deleted: number; deletionVerified: number }>;
  failureCode: "STORAGE_ROUNDTRIP_FAILED" | "STORAGE_CLEANUP_FAILED" | "STORAGE_PROBE_FAILED" | null;
}>;

/** Only a new, server-generated diagnostic object can be touched. */
export async function runStorageProbe(storage: PrivateImageStorage, requestId: string): Promise<StorageProbeResult> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(requestId)) throw new Error("INVALID_PROBE_ID");
  const key = `readiness/storage/${requestId}`;
  const counts = { uploaded: 0, verified: 0, deleted: 0, deletionVerified: 0 };
  let failureCode: StorageProbeResult["failureCode"] = null;
  try {
    await storage.stageAt({ storageKey: key, bytes: PIXEL, sha256Hex: digest(PIXEL), signal: AbortSignal.timeout(10_000) });
    counts.uploaded = 1;
    const received = await storage.read(key, AbortSignal.timeout(10_000));
    if (!received || digest(received) !== digest(PIXEL)) throw new Error("PROBE_CONTENT_MISMATCH");
    counts.verified = 1;
  } catch {
    failureCode = "STORAGE_ROUNDTRIP_FAILED";
  } finally {
    // A timeout can leave a successfully staged object: compensate the exact new key.
    try {
      await storage.requestDelete(key, AbortSignal.timeout(10_000));
      counts.deleted = 1;
      if (await storage.read(key, AbortSignal.timeout(10_000)) !== null) throw new Error("PROBE_DELETE_UNCONFIRMED");
      counts.deletionVerified = 1;
    } catch { failureCode = "STORAGE_CLEANUP_FAILED"; }
  }
  return { ok: failureCode === null, counts, failureCode };
}
