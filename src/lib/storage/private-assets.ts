import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma/client";

// Vercel Function의 요청 한도 안에서 Base64 JSON으로 받을 수 있는 원본 크기.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function inspectPng(buffer: Buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { mimeType: "image/png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function inspectJpeg(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (sofMarkers.has(marker) && length >= 7) {
      return { mimeType: "image/jpeg", width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function inspectWebp(buffer: Buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { mimeType: "image/webp", width, height };
  }
  if (chunk === "VP8L" && buffer[20] === 0x2f) {
    const width = 1 + buffer[21] + ((buffer[22] & 0x3f) << 8);
    const height = 1 + ((buffer[22] & 0xc0) >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10);
    return { mimeType: "image/webp", width, height };
  }
  if (chunk === "VP8 " && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { mimeType: "image/webp", width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function inspectImage(buffer: Buffer) {
  return inspectPng(buffer) ?? inspectJpeg(buffer) ?? inspectWebp(buffer);
}

export async function validatePrivateImage(buffer: Buffer, declaredMimeType?: string | null) {
  if (buffer.length <= 0) throw new Error("비어 있는 이미지는 등록할 수 없습니다.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("카카오 사진 한 장은 최대 3MB까지 등록할 수 있습니다.");
  const metadata = inspectImage(buffer);
  const mimeType = metadata?.mimeType ?? null;
  if (!metadata || !mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error("PNG, JPG 또는 WebP 이미지만 등록할 수 있습니다.");
  if (metadata.width <= 0 || metadata.height <= 0 || metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new Error("이미지 크기가 올바르지 않거나 허용 범위를 초과했습니다.");
  if (declaredMimeType && ALLOWED_IMAGE_TYPES.has(declaredMimeType) && declaredMimeType !== mimeType) {
    throw new Error("파일 확장자와 실제 이미지 형식이 일치하지 않습니다.");
  }
  return {
    mimeType,
    width: metadata.width,
    height: metadata.height,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function extensionForMime(mimeType: string) {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
}

export async function storePrivateImage(params: {
  buffer: Buffer;
  purpose: "DISCIPLINE_ISSUE" | "DISCIPLINE_RESOLUTION" | "INHOUSE_RESULT";
  publicCode: string;
  imageNumber: number;
  declaredMimeType?: string | null;
}) {
  const { put } = await import("@vercel/blob");
  const validated = await validatePrivateImage(params.buffer, params.declaredMimeType);
  const storageKey = `private/${params.purpose.toLowerCase()}/${params.publicCode}/${params.imageNumber}-${randomUUID()}.${extensionForMime(validated.mimeType)}`;
  const blob = await put(storageKey, params.buffer, {
    access: "private",
    contentType: validated.mimeType,
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
  });
  return prisma.privateAsset.create({
    data: {
      provider: "VERCEL_BLOB",
      storageKey: blob.pathname,
      blobUrl: blob.url,
      originalFileName: blob.pathname.split("/").at(-1) ?? null,
      mimeType: validated.mimeType,
      byteSize: params.buffer.length,
      width: validated.width,
      height: validated.height,
      sha256: validated.sha256,
      purpose: params.purpose,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
}

export async function downloadPrivateAsset(storageKey: string) {
  const { get } = await import("@vercel/blob");
  const result = await get(storageKey, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("비공개 이미지를 찾을 수 없습니다.");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function deletePrivateAsset(storageKey: string) {
  const { del } = await import("@vercel/blob");
  await del(storageKey);
}
