import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

import {
  MATCH_IMAGE_CONTENT_TYPES,
  MATCH_IMAGE_MAX_BYTES,
  MatchServiceError,
} from "../domain/match";
import type {
  PrivateImageStorage,
  ScoreboardOcr,
} from "../application/ports/private-image-storage";

export type ValidatedPrivateImage = Readonly<{
  bytes: Uint8Array;
  contentType: (typeof MATCH_IMAGE_CONTENT_TYPES)[number];
  byteSize: number;
  width: number;
  height: number;
  sha256: Buffer;
  sha256Hex: string;
  originalFileName: string | null;
}>;

function detectedContentType(bytes: Uint8Array): ValidatedPrivateImage["contentType"] | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function hasExactContainerEnd(bytes: Uint8Array, contentType: ValidatedPrivateImage["contentType"]) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (contentType === "image/webp") {
    if (bytes.length < 12) return false;
    const declaredLength = (
      bytes[4] |
      (bytes[5] << 8) |
      (bytes[6] << 16) |
      (bytes[7] << 24)
    ) >>> 0;
    return declaredLength + 8 === bytes.length;
  }
  if (bytes.length < 12) return false;
  const end = bytes.slice(bytes.length - 12);
  return (
    end[0] === 0 &&
    end[1] === 0 &&
    end[2] === 0 &&
    end[3] === 0 &&
    new TextDecoder("ascii").decode(end.slice(4, 8)) === "IEND"
  );
}

function safeOriginalName(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.normalize("NFKC").trim();
  if (
    normalized.length < 1 ||
    normalized.length > 255 ||
    /[\\/\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(
      normalized,
    )
  ) {
    return null;
  }
  return normalized;
}

export async function validatePrivateScoreboardImage(input: Readonly<{
  bytes: Uint8Array;
  declaredContentType: string | null;
  originalFileName?: string | null;
}>): Promise<ValidatedPrivateImage> {
  if (input.bytes.byteLength < 12 || input.bytes.byteLength > MATCH_IMAGE_MAX_BYTES) {
    throw new MatchServiceError("INVALID_IMAGE", "이미지는 12바이트 이상 8MiB 이하여야 합니다.");
  }
  const detected = detectedContentType(input.bytes);
  if (!detected || input.declaredContentType !== detected || !hasExactContainerEnd(input.bytes, detected)) {
    throw new MatchServiceError(
      "INVALID_IMAGE",
      "PNG, JPEG, WebP 이미지의 선언 형식과 실제 파일 형식이 일치해야 합니다.",
    );
  }
  let metadata: Metadata;
  try {
    const decoder = sharp(input.bytes, {
      failOn: "error",
      limitInputPixels: 16_777_216,
      sequentialRead: true,
    });
    metadata = await decoder.metadata();
    const expectedFormat = detected.slice("image/".length);
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width < 16 ||
      metadata.height < 16 ||
      metadata.width > 4096 ||
      metadata.height > 4096 ||
      metadata.width * metadata.height > 16_777_216 ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error("IMAGE_METADATA_REJECTED");
    }
    await decoder.clone().timeout({ seconds: 5 }).raw().toBuffer();
  } catch {
    throw new MatchServiceError(
      "INVALID_IMAGE",
      "손상되지 않은 단일 프레임 16~4096px 이미지여야 합니다.",
    );
  }
  const sha256 = createHash("sha256").update(input.bytes).digest();
  return {
    bytes: input.bytes,
    contentType: detected,
    byteSize: input.bytes.byteLength,
    width: metadata.width as number,
    height: metadata.height as number,
    sha256,
    sha256Hex: sha256.toString("hex"),
    originalFileName: safeOriginalName(input.originalFileName),
  };
}

export class FakePrivateImageStorage implements PrivateImageStorage {
  readonly storageProvider = "FAKE_LOCAL";
  readonly stored = new Map<string, Uint8Array>();

  async stageAt(input: Readonly<{ storageKey: string; bytes: Uint8Array; sha256Hex: string; signal: AbortSignal }>) {
    input.signal.throwIfAborted();
    const existing = this.stored.get(input.storageKey);
    if (existing) {
      const existingHash = createHash("sha256").update(existing).digest("hex");
      if (existingHash !== input.sha256Hex) throw new Error("FAKE_STORAGE_KEY_DIGEST_MISMATCH");
      return;
    }
    this.stored.set(input.storageKey, Uint8Array.from(input.bytes));
  }

  async requestDelete(storageKey: string, signal: AbortSignal) {
    signal.throwIfAborted();
    this.stored.delete(storageKey);
  }

  async read(storageKey: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const bytes = this.stored.get(storageKey);
    return bytes ? Uint8Array.from(bytes) : null;
  }
}

export class UnavailablePrivateImageStorage implements PrivateImageStorage {
  readonly storageProvider = "UNAVAILABLE";
  async stageAt(): Promise<void> {
    throw new Error("PRIVATE_STORAGE_NOT_CONFIGURED");
  }
  async requestDelete(): Promise<void> {
    throw new Error("PRIVATE_STORAGE_NOT_CONFIGURED");
  }
  async read(): Promise<Uint8Array | null> {
    throw new Error("PRIVATE_STORAGE_NOT_CONFIGURED");
  }
}

export class FakeScoreboardOcr implements ScoreboardOcr {
  async inspect(input: Readonly<{
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
    gameNumber: number;
    signal: AbortSignal;
  }>) {
    input.signal.throwIfAborted();
    return {
      schemaVersion: 1 as const,
      provider: "FAKE_LOCAL",
      providerRequestReferenceHash: null,
      gameNumber: input.gameNumber,
      needsHumanReview: true as const,
      participants: [],
    };
  }
}

export function fakePrivateAdaptersAllowed(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.NODE_ENV === "development" &&
    env.V2_FAKE_PRIVATE_ASSETS === "1" &&
    env.VERCEL !== "1" &&
    env.VERCEL !== "true"
  );
}
