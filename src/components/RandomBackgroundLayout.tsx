"use client";

import { useEffect, useState } from "react";

const backgrounds = [
  "/images/backgrounds/bg-1.webp",
  "/images/backgrounds/bg-2.webp",
  "/images/backgrounds/bg-3.webp",
  "/images/backgrounds/bg-4.webp",
  "/images/backgrounds/bg-5.webp",
  "/images/backgrounds/bg-6.webp",
  "/images/backgrounds/bg-7.webp",
  "/images/backgrounds/bg-8.webp",
  "/images/backgrounds/bg-9.webp",
  "/images/backgrounds/bg-10.webp",
  "/images/backgrounds/bg-11.webp",
  "/images/backgrounds/bg-12.webp",
  "/images/backgrounds/bg-13.webp",
  "/images/backgrounds/bg-14.webp",
  "/images/backgrounds/bg-15.webp",
  "/images/backgrounds/bg-16.webp",
  "/images/backgrounds/bg-17.webp",
  "/images/backgrounds/bg-18.webp",
] as const;

const FALLBACK_LEFT = "/images/backgrounds/bg-1.webp";
const FALLBACK_RIGHT = "/images/backgrounds/bg-2.webp";

type BackgroundPair = {
  left: string;
  right: string;
};

function getRandomPair(): BackgroundPair {
  const leftIndex = Math.floor(Math.random() * backgrounds.length);
  let rightIndex = Math.floor(Math.random() * backgrounds.length);

  while (backgrounds.length > 1 && rightIndex === leftIndex) {
    rightIndex = Math.floor(Math.random() * backgrounds.length);
  }

  return {
    left: backgrounds[leftIndex] ?? FALLBACK_LEFT,
    right: backgrounds[rightIndex] ?? FALLBACK_RIGHT,
  };
}

export default function RandomBackgroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [images, setImages] = useState<BackgroundPair | null>(null);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadDecorativeBackgrounds = () => setImages(getRandomPair());
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(loadDecorativeBackgrounds, { timeout: 1800 });
    } else {
      timeoutId = setTimeout(loadDecorativeBackgrounds, 400);
    }

    return () => {
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="app-background-root">
      <div
        className="app-background-side app-background-side--left"
        style={{
          backgroundImage: images ? `url("${images.left}")` : "none",
        }}
      />

      <div
        className="app-background-side app-background-side--right"
        style={{
          backgroundImage: images ? `url("${images.right}")` : "none",
        }}
      />

      <div className="app-background-overlay" />
      <div className="app-background-content">{children}</div>
    </div>
  );
}
