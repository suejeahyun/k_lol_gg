/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { normalizeGalleryImageUrl } from "@/lib/gallery/winner-image-paths";
import { getYoutubeThumbnailUrls } from "@/lib/youtube";

type SafeHighlightThumbnailProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "onError"
> & {
  youtubeId: string;
  thumbnailUrl?: string | null;
  alt: string;
  fallbackText?: string;
};

type FailedThumbnailState = {
  key: string;
  urls: Set<string>;
};

export default function SafeHighlightThumbnail({
  youtubeId,
  thumbnailUrl,
  alt,
  className,
  fallbackText = "하이라이트 썸네일을 불러올 수 없습니다.",
  loading = "lazy",
  ...props
}: SafeHighlightThumbnailProps) {
  const candidates = useMemo(() => {
    const normalizedCustomThumbnail = normalizeGalleryImageUrl(thumbnailUrl ?? "");
    const youtubeThumbnails = getYoutubeThumbnailUrls(youtubeId);
    const urls = normalizedCustomThumbnail
      ? [normalizedCustomThumbnail, ...youtubeThumbnails]
      : youtubeThumbnails;

    return Array.from(new Set(urls.filter(Boolean)));
  }, [thumbnailUrl, youtubeId]);

  const candidatesKey = candidates.join("|");

  const [failedState, setFailedState] = useState<FailedThumbnailState>({
    key: "",
    urls: new Set<string>(),
  });

  const failedUrls = failedState.key === candidatesKey
    ? failedState.urls
    : new Set<string>();

  const src = candidates.find((candidate) => !failedUrls.has(candidate));

  if (!src) {
    return (
      <div
        className={[className, "safe-highlight-thumbnail-fallback"]
          .filter(Boolean)
          .join(" ")}
        role="img"
        aria-label={alt}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      {...props}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        setFailedState((current) => {
          const nextUrls = current.key === candidatesKey
            ? new Set(current.urls)
            : new Set<string>();

          nextUrls.add(src);

          return {
            key: candidatesKey,
            urls: nextUrls,
          };
        });
      }}
    />
  );
}
