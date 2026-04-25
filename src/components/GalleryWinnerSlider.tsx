"use client";

import { useEffect, useMemo, useState } from "react";

type GalleryWinnerImage = {
  id: number;
  title: string;
  description: string;
  imageUrl: string[];
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
        item.imageUrl.map((url, index) => ({
          id: `${item.id}-${index}`,
          title: item.title,
          description: item.description,
          imageUrl: url,
        }))
      ),
    [images]
  );

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (slideItems.length <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slideItems.length);
    }, 3500);

    return () => window.clearInterval(timer);
  }, [slideItems.length]);

  if (slideItems.length === 0) {
    return (
      <div className="winner-slider winner-slider--empty">
        메인에 표시할 멸망전 우승팀 이미지가 없습니다.
      </div>
    );
  }

  const current = slideItems[currentIndex];

  return (
    <div className="winner-slider">
      <div className="winner-slider__image-wrap">
        <img
          src={current.imageUrl}
          alt={current.title}
          className="winner-slider__image"
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
            />
          ))}
        </div>
      )}
    </div>
  );
}