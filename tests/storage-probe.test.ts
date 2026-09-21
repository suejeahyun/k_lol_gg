import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { runStorageProbe } from "../src/modules/operations/application/storage-probe";
import type { PrivateImageStorage } from "../src/modules/matches/application/ports/private-image-storage";
import { VercelBlobPrivateImageStorage, type PrivateBlobSdkClient } from "../src/modules/assets/infrastructure/private-blob-storage-core";

test("storage probe reads exact bytes and removes only its new diagnostic object", async () => {
  const objects = new Map<string, Uint8Array>([["real/content", new Uint8Array([1])]]);
  const calls: string[] = [];
  const storage: PrivateImageStorage = { storageProvider: "FAKE", async stageAt(input) { calls.push(input.storageKey); objects.set(input.storageKey, input.bytes); }, async read(key) { return objects.get(key) ?? null; }, async requestDelete(key) { calls.push(key); objects.delete(key); } };
  const requestId = randomUUID();
  assert.equal((await runStorageProbe(storage, requestId)).ok, true);
  assert.deepEqual(calls, [`readiness/storage/${requestId}`, `readiness/storage/${requestId}`]);
  assert.deepEqual([...objects.keys()], ["real/content"]);
});

test("ambiguous write failure is compensated and raw errors never escape", async () => {
  const objects = new Map<string, Uint8Array>();
  const storage: PrivateImageStorage = { storageProvider: "FAKE", async stageAt(input) { objects.set(input.storageKey, input.bytes); throw new Error("private connection detail"); }, async read(key) { return objects.get(key) ?? null; }, async requestDelete(key) { objects.delete(key); } };
  const result = await runStorageProbe(storage, randomUUID());
  assert.equal(result.ok, false);assert.equal(result.failureCode, "STORAGE_ROUNDTRIP_FAILED");assert.equal(result.counts.deletionVerified, 1);assert.equal(objects.size, 0);
  assert.doesNotMatch(JSON.stringify(result), /private connection/);
});

test("cleanup failure is visible and arbitrary keys are rejected before storage access", async () => {
  let writes = 0;
  const storage: PrivateImageStorage = { storageProvider: "FAKE", async stageAt() { writes++; }, async read() { return null; }, async requestDelete() { throw new Error("provider failure"); } };
  await assert.rejects(runStorageProbe(storage, "../../real/content"), /INVALID_PROBE_ID/);
  assert.equal(writes, 0);
  assert.equal((await runStorageProbe(storage, randomUUID())).failureCode, "STORAGE_CLEANUP_FAILED");
});

test("probe bytes pass the production image adapter and cleanup reads bypass the CDN", async () => {
  const objects = new Map<string, Uint8Array>();
  const reads: boolean[] = [];
  const sdk: PrivateBlobSdkClient = {
    async put(pathname, bytes, options) {
      assert.equal(options.access, "private");
      assert.equal(options.allowOverwrite, false);
      assert.equal(options.addRandomSuffix, false);
      assert.equal(options.contentType, "image/png");
      objects.set(pathname, bytes);
      return { pathname, contentType: "image/png" };
    },
    async get(pathname, options) {
      reads.push(options.useCache);
      const bytes = objects.get(pathname);
      return bytes ? { statusCode: 200,
        stream: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
        blob: { pathname, contentType: "image/png", size: bytes.length } } : null;
    },
    async del(pathname) { objects.delete(pathname); },
  };
  const storage = new VercelBlobPrivateImageStorage({ kind: "oidc", storeId: "store_synthetic" }, sdk);
  const result = await runStorageProbe(storage, randomUUID());
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { uploaded: 1, verified: 1, deleted: 1, deletionVerified: 1 });
  assert.deepEqual(reads, [false, false]);
  assert.equal(objects.size, 0);
});
