import { createHash } from "node:crypto";

import { PRIVATE_ASSET_MAX_BYTES } from "@/modules/assets/domain/private-asset";
import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";

export const PRIVATE_BLOB_STORAGE_PROVIDER = "VERCEL_BLOB_PRIVATE";
export const PRIVATE_BLOB_MAX_BYTES = PRIVATE_ASSET_MAX_BYTES;
export type RuntimePrivateStorageMode = "FAKE_LOCAL" | "VERCEL_BLOB_PRIVATE" | "UNAVAILABLE";

type BlobPutOptions = Readonly<{
  access: "private";
  token: string;
  addRandomSuffix: false;
  allowOverwrite: false;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  maximumSizeInBytes: number;
  abortSignal: AbortSignal;
}>;

type BlobGetOptions = Readonly<{
  access: "private";
  token: string;
  useCache: false;
  abortSignal: AbortSignal;
}>;

type BlobDeleteOptions = Readonly<{ token: string; abortSignal: AbortSignal }>;

export type PrivateBlobSdkClient = Readonly<{
  put(pathname: string, bytes: Uint8Array, options: BlobPutOptions): Promise<Readonly<{ pathname: string; contentType: string }>>;
  get(pathname: string, options: BlobGetOptions): Promise<null | Readonly<{
    statusCode: 200 | 304;
    stream: ReadableStream<Uint8Array> | null;
    blob: Readonly<{ pathname: string; contentType: string | null; size: number | null }>;
  }>>;
  del(pathname: string, options: BlobDeleteOptions): Promise<void>;
}>;

const SAFE_STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,254}$/u;
const SAFE_TOKEN = /^[^\u0000-\u0020\u007f-\u009f]{32,4096}$/u;

type PrivateBlobEnvironment = Readonly<{
  BLOB_READ_WRITE_TOKEN?: string;
  DATABASE_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NODE_ENV?: string;
  V2_BROWSER_QA_MODE?: string;
  V2_DB_TEST_MODE?: string;
  V2_FAKE_PRIVATE_ASSETS?: string;
  V2_PUBLIC_ORIGIN?: string;
  VERCEL?: string;
}>;

export function privateBlobToken(env: PrivateBlobEnvironment) {
  const token = env.BLOB_READ_WRITE_TOKEN;
  return token && token === token.trim() && SAFE_TOKEN.test(token) ? token : null;
}

function isIsolatedBrowserQa(env: PrivateBlobEnvironment) {
  if (env.NODE_ENV !== "production" || env.V2_BROWSER_QA_MODE !== "true" || env.V2_DB_TEST_MODE !== "true") {
    return false;
  }
  try {
    const database = new URL(env.DATABASE_URL ?? "");
    const origin = new URL(env.V2_PUBLIC_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL ?? "");
    const databaseName = decodeURIComponent(database.pathname.replace(/^\//u, ""));
    return (
      (database.protocol === "postgres:" || database.protocol === "postgresql:") &&
      loopbackHosts.has(database.hostname) &&
      databaseName.startsWith("klol_v2_test_") &&
      origin.protocol === "http:" &&
      loopbackHosts.has(origin.hostname) &&
      origin.username === "" &&
      origin.password === "" &&
      origin.pathname === "/" &&
      origin.search === "" &&
      origin.hash === ""
    );
  } catch {
    return false;
  }
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * This is the single fail-closed policy used by every private image runtime.
 * A fixture adapter is never selectable on Vercel. Outside development it is
 * limited to the optimized browser-QA server backed by a disposable loopback
 * database whose name carries the test prefix.
 */
export function resolveRuntimePrivateStorageMode(
  env: PrivateBlobEnvironment = process.env,
): RuntimePrivateStorageMode {
  if (env.V2_FAKE_PRIVATE_ASSETS === "1" && env.VERCEL !== "1" && env.VERCEL !== "true") {
    if (env.NODE_ENV === "development" || isIsolatedBrowserQa(env)) return "FAKE_LOCAL";
  }
  return privateBlobToken(env) ? PRIVATE_BLOB_STORAGE_PROVIDER : "UNAVAILABLE";
}

function storageKey(value: string) {
  if (
    !SAFE_STORAGE_KEY.test(value) ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  ) throw new Error("PRIVATE_STORAGE_KEY_INVALID");
  return value;
}

function contentType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png" as const;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg" as const;
  if (
    bytes.length >= 12 &&
    new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp" as const;
  return null;
}

function hasExactContainerEnd(bytes: Uint8Array, type: NonNullable<ReturnType<typeof contentType>>) {
  if (type === "image/jpeg") return bytes.length >= 2 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (type === "image/webp") {
    const size = bytes.length < 12 ? -1 : (bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24)) >>> 0;
    return size + 8 === bytes.length;
  }
  if (bytes.length < 12) return false;
  const end = bytes.slice(bytes.length - 12);
  return end[0] === 0 && end[1] === 0 && end[2] === 0 && end[3] === 0 &&
    new TextDecoder("ascii").decode(end.slice(4, 8)) === "IEND";
}

function validateImageBytes(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12 || bytes.byteLength > PRIVATE_BLOB_MAX_BYTES) {
    throw new Error("PRIVATE_STORAGE_IMAGE_SIZE_INVALID");
  }
  const type = contentType(bytes);
  if (!type || !hasExactContainerEnd(bytes, type)) throw new Error("PRIVATE_STORAGE_IMAGE_CONTAINER_INVALID");
  return type;
}

async function boundedBytes(stream: ReadableStream<Uint8Array>, declaredSize: number, signal: AbortSignal) {
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 12 || declaredSize > PRIVATE_BLOB_MAX_BYTES) {
    await stream.cancel("private blob size is outside the image boundary").catch(() => undefined);
    throw new Error("PRIVATE_STORAGE_RESPONSE_SIZE_INVALID");
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > PRIVATE_BLOB_MAX_BYTES || size > declaredSize) {
        await reader.cancel("private blob exceeded its declared boundary").catch(() => undefined);
        throw new Error("PRIVATE_STORAGE_RESPONSE_SIZE_INVALID");
      }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  if (size !== declaredSize) throw new Error("PRIVATE_STORAGE_RESPONSE_SIZE_INVALID");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export class VercelBlobPrivateImageStorage implements PrivateImageStorage {
  readonly storageProvider = PRIVATE_BLOB_STORAGE_PROVIDER;
  readonly #token: string;
  readonly #client: PrivateBlobSdkClient;

  constructor(token: string, client: PrivateBlobSdkClient) {
    const checked = privateBlobToken({ BLOB_READ_WRITE_TOKEN: token });
    if (!checked) throw new Error("PRIVATE_STORAGE_TOKEN_INVALID");
    this.#token = checked;
    this.#client = client;
  }

  async stageAt(input: Readonly<{ storageKey: string; bytes: Uint8Array; sha256Hex: string; signal: AbortSignal }>) {
    const pathname = storageKey(input.storageKey);
    input.signal.throwIfAborted();
    const type = validateImageBytes(input.bytes);
    const actualDigest = createHash("sha256").update(input.bytes).digest("hex");
    if (!/^[a-f0-9]{64}$/u.test(input.sha256Hex) || actualDigest !== input.sha256Hex) {
      throw new Error("PRIVATE_STORAGE_DIGEST_MISMATCH");
    }
    try {
      const stored = await this.#client.put(pathname, input.bytes, {
        access: "private",
        token: this.#token,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: type,
        maximumSizeInBytes: PRIVATE_BLOB_MAX_BYTES,
        abortSignal: input.signal,
      });
      if (stored.pathname !== pathname || stored.contentType !== type) throw new Error("PRIVATE_STORAGE_RESPONSE_MISMATCH");
    } catch (error) {
      input.signal.throwIfAborted();
      const existing = await this.read(pathname, input.signal).catch(() => null);
      input.signal.throwIfAborted();
      if (existing && createHash("sha256").update(existing).digest("hex") === actualDigest) return;
      throw error;
    }
  }

  async read(storageKeyValue: string, signal: AbortSignal) {
    const pathname = storageKey(storageKeyValue);
    signal.throwIfAborted();
    const result = await this.#client.get(pathname, {
      access: "private",
      token: this.#token,
      useCache: false,
      abortSignal: signal,
    });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream || result.blob.pathname !== pathname || result.blob.size === null) {
      throw new Error("PRIVATE_STORAGE_RESPONSE_MISMATCH");
    }
    const bytes = await boundedBytes(result.stream, result.blob.size, signal);
    const detected = validateImageBytes(bytes);
    if (result.blob.contentType !== detected) throw new Error("PRIVATE_STORAGE_RESPONSE_MISMATCH");
    return bytes;
  }

  async requestDelete(storageKeyValue: string, signal: AbortSignal) {
    const pathname = storageKey(storageKeyValue);
    signal.throwIfAborted();
    await this.#client.del(pathname, { token: this.#token, abortSignal: signal });
    signal.throwIfAborted();
  }
}
