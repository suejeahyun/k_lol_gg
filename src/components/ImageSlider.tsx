"use client";

import SafeGalleryImage from "@/components/SafeGalleryImage";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type Props = {
  images: string[];
  title: string;
};

export default function ImageSlider({ images, title }: Props) {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [allowReducedMotionPlayback, setAllowReducedMotionPlayback] = useState(false);
  const length = images.length;
  const prefersReducedMotion = usePrefersReducedMotion();
  const autoPlayActive =
    isPlaying && (!prefersReducedMotion || allowReducedMotionPlayback);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startXRef = useRef<number | null>(null);

  const next = () => {
    if (length <= 0) return;
    setIndex((prev) => (prev + 1) % length);
  };

  const prev = () => {
    if (length <= 0) return;
    setIndex((prev) => (prev - 1 + length) % length);
  };

  useEffect(() => {
    if (length <= 1 || !autoPlayActive) return;

    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % length);
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoPlayActive, length]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    startXRef.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;

    const endX = event.changedTouches[0].clientX;
    const diff = startXRef.current - endX;

    if (diff > 50) {
      next();
    } else if (diff < -50) {
      prev();
    }

    startXRef.current = null;
  };

  if (length === 0) {
    return null;
  }

  return (
    <div
      className="image-slider"
      role="region"
      aria-label={`${title} 이미지 슬라이드`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="image-slider__track"
        style={{
          transform: `translateX(-${index * 100}%)`,
        }}
      >
        {images.map((url, imageIndex) => (
          <SafeGalleryImage
            key={`${url}-${imageIndex}`}
            src={url}
            alt={`${title} ${imageIndex + 1}`}
            width={960}
            height={540}
            className="image-slider__image"
          />
        ))}
      </div>

      {length > 1 ? (
        <>
          <button
            type="button"
            className="image-slider__button image-slider__button--left"
            onClick={prev}
            aria-label="이전 이미지"
          >
            ‹
          </button>

          <button
            type="button"
            className="image-slider__button image-slider__button--right"
            onClick={next}
            aria-label="다음 이미지"
          >
            ›
          </button>

          <div className="image-slider__indicator" aria-live="polite">
            {index + 1} / {length}
          </div>

          <button
            type="button"
            className="image-slider__autoplay"
            onClick={() => {
              if (autoPlayActive) {
                setIsPlaying(false);
                return;
              }

              setAllowReducedMotionPlayback(true);
              setIsPlaying(true);
            }}
            aria-label={autoPlayActive ? "이미지 자동 넘김 일시정지" : "이미지 자동 넘김 재생"}
          >
            {autoPlayActive ? "일시정지" : "재생"}
          </button>
        </>
      ) : null}
    </div>
  );
}
