/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { normalizeGalleryImageUrl } from "@/lib/gallery/winner-image-paths";

type SafeGalleryImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "onError"
> & {
  src?: string | null;
  alt: string;
  fallbackText?: string;
};

export default function SafeGalleryImage({
  src,
  alt,
  className,
  fallbackText = "이미지를 불러올 수 없습니다.",
  loading = "lazy",
  ...props
}: SafeGalleryImageProps) {
  const normalizedSrc = useMemo(
    () => normalizeGalleryImageUrl(src ?? ""),
    [src]
  );

  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasError = Boolean(normalizedSrc && failedSrc === normalizedSrc);

  if (!normalizedSrc || hasError) {
    return (
      <div
        className={[className, "safe-gallery-image-fallback"]
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
      src={normalizedSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailedSrc(normalizedSrc)}
    />
  );
}
