"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

import styles from "./media.module.css";

export function ResilientMediaImage({
  src,
  alt,
  sizes,
}: Readonly<{
  src: string;
  alt: string;
  sizes: string;
}>) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={styles.mediaFallback} role="img" aria-label={`${alt || "미디어"} 이미지를 불러올 수 없음`}>
        <ImageOff aria-hidden="true" />
        <strong>이미지를 불러올 수 없어요</strong>
        <small>잠시 후 다시 확인해 주세요.</small>
      </span>
    );
  }

  return (
    <Image
      unoptimized
      fill
      sizes={sizes}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
