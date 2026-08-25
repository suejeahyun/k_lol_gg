import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma/client";

// Vercel Function의 요청 한도 안에서 Base64 JSON으로 받을 수 있는 원본 크기.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function validatePrivateImage(buffer: Buffer, declaredMimeType?: string | null) {
  if (buffer.length <= 0) throw new Error("비어 있는 이미지는 등록할 수 없습니다.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("카카오 사진 한 장은 최대 3MB까지 등록할 수 있습니다.");
  // 이미지/Blob SDK의 네이티브 또는 환경 의존 모듈이 라우트 로딩 자체를
  // 중단하지 않도록 실제 사진 처리 시점에만 불러온다.
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata().catch(() => null);
  const mimeType = metadata?.format === "png"
    ? "image/png"
    : metadata?.format === "jpeg"
      ? "image/jpeg"
      : metadata?.format === "webp"
        ? "image/webp"
        : null;
  if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error("PNG, JPG 또는 WebP 이미지만 등록할 수 있습니다.");
  if (declaredMimeType && ALLOWED_IMAGE_TYPES.has(declaredMimeType) && declaredMimeType !== mimeType) {
    throw new Error("파일 확장자와 실제 이미지 형식이 일치하지 않습니다.");
  }
  return {
    mimeType,
    width: metadata?.width ?? null,
    height: metadata?.height ?? null,
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
