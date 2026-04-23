"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  images: string[];
  title: string;
};

export default function ImageSlider({ images, title }: Props) {
  const [index, setIndex] = useState(0);
  const length = images.length;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startXRef = useRef<number | null>(null);

  const next = () => {
    setIndex((prev) => (prev + 1) % length);
  };

  const prev = () => {
    setIndex((prev) => (prev - 1 + length) % length);
  };

  useEffect(() => {
    if (length <= 1) return;

    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % length);
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [length]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;

    const endX = e.changedTouches[0].clientX;
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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="image-slider__track"
        style={{
          transform: `translateX(-${index * 100}%)`,
        }}
      >
        {images.map((url, i) => (
          <img
            key={`${url}-${i}`}
            src={url}
            alt={`${title} ${i + 1}`}
            className="image-slider__image"
          />
        ))}
      </div>

      {length > 1 && (
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

          <div className="image-slider__indicator">
            {index + 1} / {length}
          </div>
        </>
      )}
    </div>
  );
}