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
    (_, index) => `${DESTRUCTION_WINNER_IMAGE_BASE_PATH}/${Math.trunc(round)}/${index + 1}.jpg`
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

export function normalizeGalleryImageUrl(url: string): string {
  const value = url.trim();

  if (!value) {
    return "";
  }

  const googleDriveFileId = extractGoogleDriveFileId(value);
  if (googleDriveFileId) {
    return buildGoogleDriveThumbnailUrl(googleDriveFileId);
  }

  return value.replace(/^https?:\/\/[^/]+(?=\/images\/)/, "");
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
