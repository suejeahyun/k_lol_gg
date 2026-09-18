export function stepMediaCarouselIndex(
  currentIndex: number,
  direction: -1 | 1,
  slideCount: number,
): number {
  if (!Number.isSafeInteger(slideCount) || slideCount < 0) {
    throw new TypeError("MEDIA_CAROUSEL_SLIDE_COUNT_INVALID");
  }
  if (slideCount <= 1) return 0;
  const safeIndex = Number.isSafeInteger(currentIndex)
    ? ((currentIndex % slideCount) + slideCount) % slideCount
    : 0;
  return (safeIndex + direction + slideCount) % slideCount;
}

export function stepMediaCarouselWheelIndex(
  currentIndex: number,
  direction: -1 | 1,
  slideCount: number,
): number {
  if (!Number.isSafeInteger(slideCount) || slideCount < 0) {
    throw new TypeError("MEDIA_CAROUSEL_SLIDE_COUNT_INVALID");
  }
  if (slideCount <= 1) return 0;
  const safeIndex = Number.isSafeInteger(currentIndex)
    ? Math.min(slideCount - 1, Math.max(0, currentIndex))
    : 0;
  return Math.min(slideCount - 1, Math.max(0, safeIndex + direction));
}
