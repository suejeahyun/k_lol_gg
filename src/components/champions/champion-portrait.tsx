"use client";

/* eslint-disable @next/next/no-img-element -- Riot Data Dragon URLs are DB-allowlisted and must keep a client-side error fallback. */

import { useState } from "react";

import { championPortraitInitial, normalizeChampionImageUrl, resolveChampionImageUrl } from "@/modules/champions/domain/champion-image";

import styles from "./champion-portrait.module.css";

export function ChampionPortrait({
  displayName,
  imageUrl,
  championKey,
  eager = false,
  className,
}: Readonly<{
  displayName: string;
  imageUrl: string | null;
  championKey?: string | null;
  eager?: boolean;
  className?: string;
}>) {
  const [failed, setFailed] = useState(false);
  const safeUrl = normalizeChampionImageUrl(imageUrl) ?? resolveChampionImageUrl(null, championKey);
  const classes = [styles.portrait, className].filter(Boolean).join(" ");

  if (!safeUrl || failed) {
    return <span className={`${classes} ${styles.fallback}`} role="img" aria-label={`${displayName} 챔피언 이미지 없음`}>{championPortraitInitial(displayName)}</span>;
  }
  return <img className={classes} src={safeUrl} alt={`${displayName} 챔피언`} width={48} height={48} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
