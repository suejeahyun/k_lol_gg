"use client";

import { useEffect, useState } from "react";

const backgrounds = [
  "/images/backgrounds/bg-1.jpg",
  "/images/backgrounds/bg-2.jpg",
  "/images/backgrounds/bg-3.jpg",
  "/images/backgrounds/bg-4.jpg",
  "/images/backgrounds/bg-5.jpg",
  "/images/backgrounds/bg-6.jpg",
  "/images/backgrounds/bg-7.jpg",
  "/images/backgrounds/bg-8.jpg",
  "/images/backgrounds/bg-9.jpg",
  "/images/backgrounds/bg-10.jpg",
  "/images/backgrounds/bg-11.jpg",
  "/images/backgrounds/bg-12.jpg",
  "/images/backgrounds/bg-13.jpg",
  "/images/backgrounds/bg-14.jpg",
  "/images/backgrounds/bg-15.jpg",
  "/images/backgrounds/bg-16.jpg",
  "/images/backgrounds/bg-17.jpg",
  "/images/backgrounds/bg-18.jpg",
] as const;

const FALLBACK_LEFT = "/images/backgrounds/bg-1.jpg";
const FALLBACK_RIGHT = "/images/backgrounds/bg-2.jpg";

function getRandomPair() {
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
  const [images, setImages] = useState({
    left: FALLBACK_LEFT,
    right: FALLBACK_RIGHT,
  });

  useEffect(() => {
    setImages(getRandomPair());
  }, []);

  return (
    <div className="app-background-root">
      <div
        className="app-background-side app-background-side--left"
        style={{
          backgroundImage: `url("${images.left}")`,
        }}
      />

      <div
        className="app-background-side app-background-side--right"
        style={{
          backgroundImage: `url("${images.right}")`,
        }}
      />

      <div className="app-background-overlay" />
      <div className="app-background-content">{children}</div>
    </div>
  );
}