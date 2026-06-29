export const DESTRUCTION_WINNER_IMAGE_BASE_PATH = "/images/winners/destruction";

export const DESTRUCTION_WINNER_IMAGE_COUNTS: Record<number, number> = {
  2: 1,
  3: 1,
  4: 1,
  5: 5,
  6: 5,
};

const GOOGLE_DRIVE_FILE_ID_PATTERN = /[-\w]{25,}/;

export function getDestructionWinnerImageCount(round: number): number {
  return DESTRUCTION_WINNER_IMAGE_COUNTS[round] ?? (round >= 5 ? 5 : 1);
}

export function buildDestructionWinnerImageUrls(
  round: number,
  imageCount = getDestructionWinnerImageCount(round)
): string[] {
  if (!Number.isFinite(round) || round <= 0) {
    return [];
  }

  const safeCount = Math.min(Math.max(Math.trunc(imageCount), 1), 5);

  return Array.from(
    { length: safeCount },
    (_, index) => `${DESTRUCTION_WINNER_IMAGE_BASE_PATH}/${Math.trunc(round)}/${index + 1}.webp`
  );
}

export function extractGoogleDriveFileId(input: string): string | null {
  const value = input.trim();

  if (!value.includes("drive.google.com")) {
    return null;
  }

  const filePathMatch = value.match(/\/file\/d\/([^/?#]+)/);
  if (filePathMatch?.[1]) {
    return filePathMatch[1];
  }

  try {
    const url = new URL(value);
    const idParam = url.searchParams.get("id");

    if (idParam) {
      return idParam;
    }
  } catch {
    const idMatch = value.match(/[?&]id=([^&#]+)/);
    if (idMatch?.[1]) {
      return idMatch[1];
    }
  }

  return value.match(GOOGLE_DRIVE_FILE_ID_PATTERN)?.[0] ?? null;
}

export function buildGoogleDriveThumbnailUrl(fileId: string, size = "w1600"): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${size}`;
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^['\"]+|['\"]+$/g, "").trim();
}

function normalizeLocalImagePath(value: string): string {
  let localPath = value.trim().replace(/\\/g, "/");

  // DB에 운영 도메인 포함 URL이 저장된 경우 /images/... 로 환원합니다.
  localPath = localPath.replace(/^https?:\/\/[^/]+(?=\/images\/)/, "");

  // DB에 public/images/... 또는 /public/images/... 로 저장된 경우 브라우저 URL로 환원합니다.
  localPath = localPath.replace(/^\/?public(?=\/images\/)/, "");

  // Windows 절대경로가 저장된 경우 public/images 이후만 사용합니다.
  const publicImageIndex = localPath.toLowerCase().lastIndexOf("/public/images/");
  if (publicImageIndex >= 0) {
    localPath = localPath.slice(publicImageIndex + "/public".length);
  }

  if (localPath && !localPath.startsWith("/") && localPath.startsWith("images/")) {
    localPath = `/${localPath}`;
  }

  if (/^\/images\/winners\/.+\.(?:jpg|jpeg|png)$/i.test(localPath)) {
    return localPath.replace(/\.(?:jpg|jpeg|png)$/i, ".webp");
  }

  return localPath;
}

export function normalizeGalleryImageUrl(url: string): string {
  const value = stripWrappingQuotes(url);

  if (!value) {
    return "";
  }

  const googleDriveFileId = extractGoogleDriveFileId(value);
  if (googleDriveFileId) {
    return buildGoogleDriveThumbnailUrl(googleDriveFileId);
  }

  return normalizeLocalImagePath(value);
}

export function normalizeGalleryImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();

  return urls
    .map(normalizeGalleryImageUrl)
    .filter(Boolean)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

export function coerceGalleryImageUrls(input: unknown): string[] {
  if (Array.isArray(input)) {
    return normalizeGalleryImageUrls(
      input.filter((item): item is string => typeof item === "string")
    );
  }

  if (typeof input !== "string") {
    return [];
  }

  const value = input.trim();

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      return coerceGalleryImageUrls(parsed);
    }
  } catch {
    // 일반 문자열 URL은 그대로 처리합니다.
  }

  return normalizeGalleryImageUrls(
    value
      .split(/\r?\n|,/)
      .map((url) => url.trim())
      .filter(Boolean)
  );
}

export function getGalleryThumbnailUrl(input: unknown): string {
  return coerceGalleryImageUrls(input)[0] ?? "";
}
