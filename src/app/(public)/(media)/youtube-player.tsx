"use client";

import { Clapperboard, Play } from "lucide-react";
import { useState } from "react";

import styles from "./media.module.css";

export function YouTubePlayer({ youtubeId, title }: Readonly<{ youtubeId: string; title: string }>) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  return (
    <button className={styles.playerPreview} type="button" onClick={() => setPlaying(true)} aria-label={`${title} 영상 재생`}>
      <Clapperboard aria-hidden="true" />
      <span>
        <small>YOUTUBE HIGHLIGHT</small>
        <strong>{title}</strong>
        <em><Play aria-hidden="true" /> 영상 재생</em>
      </span>
    </button>
  );
}
