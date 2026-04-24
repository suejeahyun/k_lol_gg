"use client";

import { useEffect, useState } from "react";

const backgrounds = [
  "/images/backgrounds/bg-1.jpg",
  "/images/backgrounds/bg-2.jpg",
  "/images/backgrounds/bg-3.jpg",
  "/images/backgrounds/bg-4.jpg",
  "/images/backgrounds/bg-5.jpg",
] as const;

const FALLBACK_LEFT = "/images/backgrounds/bg-1.jpg";
const FALLBACK_RIGHT = "/images/backgrounds/bg-2.jpg";

export default function RandomBackgroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [leftImage, setLeftImage] = useState<string>(FALLBACK_LEFT);
  const [rightImage, setRightImage] = useState<string>(FALLBACK_RIGHT);

  useEffect(() => {
    const leftIndex = Math.floor(Math.random() * backgrounds.length);
    let rightIndex = Math.floor(Math.random() * backgrounds.length);

    if (backgrounds.length > 1) {
      while (rightIndex === leftIndex) {
        rightIndex = Math.floor(Math.random() * backgrounds.length);
      }
    }

    const selectedLeft = backgrounds[leftIndex] ?? FALLBACK_LEFT;
    const selectedRight = backgrounds[rightIndex] ?? FALLBACK_RIGHT;

    setLeftImage(selectedLeft);
    setRightImage(selectedRight);
  }, []);

  return (
    <div
      className="app-background-root"
      style={
        {
          "--app-bg-left": `url(${leftImage})`,
          "--app-bg-right": `url(${rightImage})`,
        } as React.CSSProperties
      }
    >
      <div className="app-background-image" />
      <div className="app-background-overlay" />
      <div className="app-background-content">{children}</div>
    </div>
  );
}