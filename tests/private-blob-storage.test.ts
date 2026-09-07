import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PRIVATE_BLOB_MAX_BYTES,
  PRIVATE_BLOB_STORAGE_PROVIDER,
  VercelBlobPrivateImageStorage,
  privateBlobToken,
  resolveRuntimePrivateStorageMode,
  type PrivateBlobSdkClient,
} from "../src/modules/assets/infrastructure/private-blob-storage-core";
import { PRIVATE_ASSET_MAX_BYTES } from "../src/modules/assets/domain/private-asset";
import { MATCH_IMAGE_MAX_BYTES } from "../src/modules/matches/domain/match";

const SDK_AUTH_FIXTURE = "unit-test-" + "a".repeat(48);

function pngBytes(tail = 0) {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    1, 2, 3, tail,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
  ]);
}

function byteStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes));
      controller.close();
    },
  });
}

function sdkFixture() {
  const stored = new Map<string, Readonly<{ bytes: Uint8Array; contentType: string }>>();
  const calls: Array<Readonly<{ operation: "put" | "get" | "del"; pathname: string; options: object }>> = [];
  const client: PrivateBlobSdkClient = {
    async put(pathname, bytes, options) {
      calls.push({ operation: "put", pathname, options });
      if (stored.has(pathname)) throw new Error("BLOB_PATHNAME_CONFLICT");
      stored.set(pathname, { bytes: Uint8Array.from(bytes), contentType: options.contentType });
      return { pathname, contentType: options.contentType };
    },
    async get(pathname, options) {
      calls.push({ operation: "get", pathname, options });
      const value = stored.get(pathname);
      return value ? {
        statusCode: 200,
        stream: byteStream(value.bytes),
        blob: { pathname, contentType: value.contentType, size: value.bytes.byteLength },
      } : null;
    },
    async del(pathname, options) {
      calls.push({ operation: "del", pathname, options });
      stored.delete(pathname);
    },
  };
  return { client, calls, stored };
}

test("private storage mode is one fail-closed production policy", () => {
  assert.equal(privateBlobToken({}), null);
  assert.equal(privateBlobToken({ BLOB_READ_WRITE_TOKEN: ` ${SDK_AUTH_FIXTURE}` }), null);
  assert.equal(resolveRuntimePrivateStorageMode({ NODE_ENV: "production", V2_FAKE_PRIVATE_ASSETS: "1" }), "UNAVAILABLE");
  assert.equal(resolveRuntimePrivateStorageMode({ NODE_ENV: "production", V2_FAKE_PRIVATE_ASSETS: "1", BLOB_READ_WRITE_TOKEN: SDK_AUTH_FIXTURE }), PRIVATE_BLOB_STORAGE_PROVIDER);
  assert.equal(resolveRuntimePrivateStorageMode({ NODE_ENV: "development", V2_FAKE_PRIVATE_ASSETS: "1", VERCEL: "1", BLOB_READ_WRITE_TOKEN: SDK_AUTH_FIXTURE }), PRIVATE_BLOB_STORAGE_PROVIDER);
  assert.equal(resolveRuntimePrivateStorageMode({ NODE_ENV: "development", V2_FAKE_PRIVATE_ASSETS: "1" }), "FAKE_LOCAL");
  const isolatedQa = {
    NODE_ENV: "production",
    V2_FAKE_PRIVATE_ASSETS: "1",
    V2_BROWSER_QA_MODE: "true",
    V2_DB_TEST_MODE: "true",
    DATABASE_URL: "postgres://qa@127.0.0.1:5432/klol_v2_test_capture",
    V2_PUBLIC_ORIGIN: "http://127.0.0.1:3210",
  } as const;
  assert.equal(resolveRuntimePrivateStorageMode(isolatedQa), "FAKE_LOCAL");
  assert.equal(resolveRuntimePrivateStorageMode({ ...isolatedQa, DATABASE_URL: "postgres://qa@example.com/klol_v2_test_capture" }), "UNAVAILABLE");
  assert.equal(resolveRuntimePrivateStorageMode({ ...isolatedQa, DATABASE_URL: "postgres://qa@127.0.0.1/production" }), "UNAVAILABLE");
  assert.equal(resolveRuntimePrivateStorageMode({ ...isolatedQa, V2_PUBLIC_ORIGIN: "https://example.com" }), "UNAVAILABLE");
  assert.equal(resolveRuntimePrivateStorageMode({ ...isolatedQa, VERCEL: "1" }), "UNAVAILABLE");
  assert.throws(() => new VercelBlobPrivateImageStorage("short", sdkFixture().client), /TOKEN_INVALID/u);
});

test("fake private storage can preload immutable local QA bytes without sharing caller buffers", async () => {
  const bytes = pngBytes();
  const storage = new (await import("../src/modules/matches/infrastructure/private-image")).FakePrivateImageStorage([
    ["qa/match/image", bytes],
  ]);
  bytes[0] = 0;
  const read = await storage.read("qa/match/image", new AbortController().signal);
  assert.equal(read?.[0], 0x89);
  read![0] = 0;
  assert.equal((await storage.read("qa/match/image", new AbortController().signal))?.[0], 0x89);
});

test("official SDK seam uses private deterministic collision-safe put/get/delete options", async () => {
  const fixture = sdkFixture();
  const storage = new VercelBlobPrivateImageStorage(SDK_AUTH_FIXTURE, fixture.client);
  const bytes = pngBytes();
  const sha256Hex = createHash("sha256").update(bytes).digest("hex");
  const storageKey = "media/gallery/item-1/asset-1-deadbeef";
  const signal = new AbortController().signal;

  await storage.stageAt({ storageKey, bytes, sha256Hex, signal });
  assert.deepEqual(await storage.read(storageKey, signal), bytes);
  await storage.requestDelete(storageKey, signal);
  assert.equal(await storage.read(storageKey, signal), null);

  const put = fixture.calls.find((call) => call.operation === "put")!;
  assert.equal(put.pathname, storageKey);
  assert.deepEqual(put.options, {
    access: "private",
    token: SDK_AUTH_FIXTURE,
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "image/png",
    maximumSizeInBytes: 4 * 1024 * 1024,
    abortSignal: signal,
  });
  const get = fixture.calls.find((call) => call.operation === "get")!;
  assert.deepEqual(get.options, { access: "private", token: SDK_AUTH_FIXTURE, useCache: false, abortSignal: signal });
  const del = fixture.calls.find((call) => call.operation === "del")!;
  assert.deepEqual(del.options, { token: SDK_AUTH_FIXTURE, abortSignal: signal });
  assert.equal(JSON.stringify(storage).includes(SDK_AUTH_FIXTURE), false);
});

test("deterministic retries are idempotent only for the same digest and DELETE_PENDING cleanup is repeatable", async () => {
  const fixture = sdkFixture();
  const storage = new VercelBlobPrivateImageStorage(SDK_AUTH_FIXTURE, fixture.client);
  const signal = new AbortController().signal;
  const storageKey = "discipline/task-1/asset-1/deadbeef";
  const bytes = pngBytes();
  const digest = createHash("sha256").update(bytes).digest("hex");

  await storage.stageAt({ storageKey, bytes, sha256Hex: digest, signal });
  await storage.stageAt({ storageKey, bytes, sha256Hex: digest, signal });
  const other = pngBytes(9);
  await assert.rejects(
    storage.stageAt({ storageKey, bytes: other, sha256Hex: createHash("sha256").update(other).digest("hex"), signal }),
    /BLOB_PATHNAME_CONFLICT/u,
  );
  await storage.requestDelete(storageKey, signal);
  await storage.requestDelete(storageKey, signal);
});

test("adapter rejects traversal, mismatched digest, invalid containers and pre-aborted calls before SDK access", async () => {
  const fixture = sdkFixture();
  const storage = new VercelBlobPrivateImageStorage(SDK_AUTH_FIXTURE, fixture.client);
  const bytes = pngBytes();
  const digest = createHash("sha256").update(bytes).digest("hex");
  const signal = new AbortController().signal;

  await assert.rejects(storage.stageAt({ storageKey: "media/../secret", bytes, sha256Hex: digest, signal }), /KEY_INVALID/u);
  await assert.rejects(storage.stageAt({ storageKey: "media/good", bytes, sha256Hex: "0".repeat(64), signal }), /DIGEST_MISMATCH/u);
  await assert.rejects(storage.stageAt({ storageKey: "media/good", bytes: Uint8Array.from({ length: 24 }, () => 1), sha256Hex: "0".repeat(64), signal }), /CONTAINER_INVALID/u);
  const controller = new AbortController();
  controller.abort(new Error("deadline"));
  await assert.rejects(storage.read("media/good", controller.signal), /deadline/u);
  assert.equal(fixture.calls.length, 0);
});

test("all application and Blob boundaries share the 4 MiB server upload ceiling", () => {
  assert.equal(PRIVATE_ASSET_MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(MATCH_IMAGE_MAX_BYTES, PRIVATE_ASSET_MAX_BYTES);
  assert.equal(PRIVATE_BLOB_MAX_BYTES, PRIVATE_ASSET_MAX_BYTES);
});
