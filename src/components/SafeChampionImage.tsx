/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

type SafeChampionImageProps = {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  className?: string;
  fallbackClassName?: string;
};

function isValidImageSrc(src?: string | null) {
  if (!src) return false;

  const value = src.trim();
  if (!value) return false;

  return (
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("/")
  );
}

export default function SafeChampionImage({
  src,
  alt,
  width,
  height,
  className,
  fallbackClassName,
}: SafeChampionImageProps) {
  const [failed, setFailed] = useState(false);
  const normalizedSrc = typeof src === "string" ? src.trim() : "";

  if (failed || !isValidImageSrc(normalizedSrc)) {
    return (
      <span
        aria-label={`${alt} 이미지 없음`}
        className={fallbackClassName ?? className}
        style={{ width, height }}
      />
    );
  }

  return (
    <img
      src={normalizedSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
