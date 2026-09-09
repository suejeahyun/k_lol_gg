"use client";

/* eslint-disable @next/next/no-img-element -- Riot Data Dragon URLs are allowlisted and require a client-side candidate fallback. */

import { useState } from "react";

import { championImageCandidates, championPortraitInitial } from "@/modules/champions/domain/champion-image";

import styles from "./champion-portrait.module.css";

export function ChampionPortrait({
  displayName,
  imageUrl,
  championKey,
  variant = "icon",
  eager = false,
  className,
}: Readonly<{
  displayName: string;
  imageUrl: string | null;
  championKey?: string | null;
  variant?: "icon" | "splash";
  eager?: boolean;
  className?: string;
}>) {
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const safeUrl = championImageCandidates(imageUrl, championKey, displayName, variant)
    .find((candidate) => !failedUrls.includes(candidate)) ?? null;
  const classes = [styles.portrait, className].filter(Boolean).join(" ");

  if (!safeUrl) {
    return <span className={`${classes} ${styles.fallback}`} role="img" aria-label={`${displayName} 챔피언 이미지 없음`}>{championPortraitInitial(displayName)}</span>;
  }
  return <img className={classes} src={safeUrl} alt={`${displayName} 챔피언`} width={48} height={48} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrls((current) => current.includes(safeUrl) ? current : [...current, safeUrl])} />;
}
