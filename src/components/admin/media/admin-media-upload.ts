import { PRIVATE_ASSET_MAX_BYTES } from "@/modules/assets/domain/private-asset";

type UploadFile = Readonly<{
  name: string;
  type: string;
  size: number;
}>;

export type GalleryUploadReport = Readonly<{
  uploaded: number;
  linked: number;
  failedNames: readonly string[];
  attachmentError?: string;
}>;

export function galleryFileProblem(file: UploadFile) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "PNG, JPEG, WebP 파일이 아닙니다.";
  if (file.size < 12 || file.size > PRIVATE_ASSET_MAX_BYTES) return "파일 크기가 4MiB 제한을 벗어났습니다.";
  return null;
}

export function planGalleryFiles<T extends UploadFile>(files: readonly T[], capacity: number) {
  const accepted: T[] = [];
  const rejected: Array<Readonly<{ file: T; reason: string }>> = [];
  const boundedCapacity = Math.max(0, Math.min(5, Math.trunc(capacity)));
  for (const file of files) {
    const problem = galleryFileProblem(file);
    if (problem) rejected.push({ file, reason: problem });
    else if (accepted.length >= boundedCapacity) rejected.push({ file, reason: "갤러리 최대 5장 제한을 넘었습니다." });
    else accepted.push(file);
  }
  return { accepted, rejected } as const;
}

export function galleryFileProblemLabels(rejected: ReadonlyArray<Readonly<{ file: UploadFile; reason: string }>>) {
  const visible = rejected.slice(0, 8).map(({ file, reason }) => `${file.name.slice(0, 240)} (${reason})`);
  if (rejected.length > visible.length) visible.push(`외 ${rejected.length - visible.length}개 파일 (선택 조건 불일치)`);
  return visible;
}

export function parseGalleryUploadReport(raw: string | null): GalleryUploadReport | null {
  if (!raw || raw.length > 10_000) return null;
  try {
    const value = JSON.parse(raw) as Partial<GalleryUploadReport>;
    if (!Number.isInteger(value.uploaded) || value.uploaded! < 0 || value.uploaded! > 5) return null;
    if (!Number.isInteger(value.linked) || value.linked! < 0 || value.linked! > value.uploaded!) return null;
    if (!Array.isArray(value.failedNames) || value.failedNames.length > 20 || value.failedNames.some((name) => typeof name !== "string" || name.length === 0 || name.length > 400)) return null;
    if (value.attachmentError !== undefined && (typeof value.attachmentError !== "string" || value.attachmentError.length > 500)) return null;
    return {
      uploaded: value.uploaded!,
      linked: value.linked!,
      failedNames: value.failedNames,
      ...(value.attachmentError ? { attachmentError: value.attachmentError } : {}),
    };
  } catch { return null; }
}
