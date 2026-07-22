"use client";

import SafeGalleryImage from "@/components/SafeGalleryImage";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";
import { useEffect, useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type GalleryWinnerImage = {
  id: number;
  title: string;
  description: string;
  imageUrl: unknown;
};

type GalleryWinnerSliderProps = {
  images: GalleryWinnerImage[];
};

export default function GalleryWinnerSlider({
  images,
}: GalleryWinnerSliderProps) {
  const slideItems = useMemo(
    () =>
      images.flatMap((item) =>
        coerceGalleryImageUrls(item.imageUrl).map((url, index) => ({
          id: `${item.id}-${index}`,
          title: item.title,
          description: item.description,
          imageUrl: url,
        }))
      ),
    [images]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [allowReducedMotionPlayback, setAllowReducedMotionPlayback] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const autoPlayActive =
    isPlaying && (!prefersReducedMotion || allowReducedMotionPlayback);

  useEffect(() => {
    if (slideItems.length <= 1 || !autoPlayActive) return;

    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slideItems.length);
    }, 3500);

    return () => window.clearInterval(timer);
  }, [autoPlayActive, slideItems.length]);

  if (slideItems.length === 0) {
    return (
      <div className="winner-slider winner-slider--empty">
        메인에 표시할 멸망전 우승팀 이미지가 없습니다.
      </div>
    );
  }

  const current = slideItems[currentIndex];

  return (
    <div className="winner-slider" role="region" aria-label="멸망전 우승팀 이미지 슬라이드">
      <div className="winner-slider__image-wrap">
        <SafeGalleryImage
          src={current.imageUrl}
          alt={current.title}
          width={960}
          height={540}
          className="winner-slider__image"
          loading="eager"
        />
      </div>

      <div className="winner-slider__overlay" />

      <div className="winner-slider__content">
        <p className="winner-slider__eyebrow">멸망전 우승팀</p>
        <h2 className="winner-slider__title">{current.title}</h2>

        {current.description && (
          <p className="winner-slider__description">{current.description}</p>
        )}
      </div>

      {slideItems.length > 1 && (
        <div className="winner-slider__dots">
          {slideItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={
                index === currentIndex
                  ? "winner-slider__dot winner-slider__dot--active"
                  : "winner-slider__dot"
              }
              onClick={() => setCurrentIndex(index)}
              aria-label={`${index + 1}번째 우승팀 이미지 보기`}
              aria-current={index === currentIndex ? "true" : undefined}
            />
          ))}
          <button
            type="button"
            className="winner-slider__pause"
            onClick={() => {
              if (autoPlayActive) {
                setIsPlaying(false);
                return;
              }

              setAllowReducedMotionPlayback(true);
              setIsPlaying(true);
            }}
            aria-label={autoPlayActive ? "우승팀 이미지 자동 넘김 일시정지" : "우승팀 이미지 자동 넘김 재생"}
          >
            {autoPlayActive ? "일시정지" : "재생"}
          </button>
        </div>
      )}
    </div>
  );
}
