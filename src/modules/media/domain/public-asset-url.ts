/** Version changes bypass images cached before public metadata stripping. */
export function publicMediaAssetUrl(assetId: string) {
  return `/api/media/assets/${encodeURIComponent(assetId)}?v=2`;
}
