export const DESTRUCTION_WINNER_IMAGE_BASE_PATH = "/images/winners/destruction";

export const DESTRUCTION_WINNER_IMAGE_COUNTS: Record<number, number> = {
  2: 1,
  3: 1,
  4: 1,
  5: 5,
  6: 5,
};

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

export function normalizeGalleryImageUrl(url: string): string {
  return url.trim().replace(/^https?:\/\/[^/]+(?=\/images\/)/, "");
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
