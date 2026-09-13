"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import styles from "./media.module.css";
import { ResilientMediaImage } from "./resilient-media-image";
import { stepMediaCarouselIndex } from "./media-carousel-state";

export type MediaCarouselSlide = Readonly<{
  id: string;
  src: string;
  alt: string;
  href?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}>;

export function MediaCarousel({
  label,
  slides,
  sizes,
  variant = "detail",
}: Readonly<{
  label: string;
  slides: readonly MediaCarouselSlide[];
  sizes: string;
  variant?: "detail" | "compact";
}>) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselId = useId();
  const activeIndex = slides.length > 0 ? currentIndex % slides.length : 0;
  const activeSlide = slides[activeIndex];

  if (!activeSlide) return null;

  function move(direction: -1 | 1) {
    setCurrentIndex((index) => stepMediaCarouselIndex(index, direction, slides.length));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  }

  const visual = (
    <ResilientMediaImage
      key={activeSlide.id}
      sizes={sizes}
      src={activeSlide.src}
      alt={activeSlide.alt}
    />
  );

  return (
    <section
      className={styles.mediaCarousel}
      data-variant={variant}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={`${carouselId}-status`}
      onKeyDown={handleKeyDown}
    >
      <figure
        className={styles.carouselSlide}
        role="group"
        aria-roledescription="slide"
        aria-label={`${activeIndex + 1} / ${slides.length}`}
      >
        <div className={styles.carouselViewport} id={`${carouselId}-slide`}>
          {activeSlide.href ? (
            <Link className={styles.carouselImageLink} href={activeSlide.href} aria-label={`${activeSlide.alt} 상세 보기`}>
              {visual}
            </Link>
          ) : visual}
        </div>
        {activeSlide.eyebrow || activeSlide.title || activeSlide.description ? (
          <figcaption className={styles.carouselCaption}>
            {activeSlide.eyebrow ? <span>{activeSlide.eyebrow}</span> : null}
            {activeSlide.title ? <strong>{activeSlide.title}</strong> : null}
            {activeSlide.description ? <small>{activeSlide.description}</small> : null}
          </figcaption>
        ) : null}
      </figure>

      <div className={styles.carouselFooter}>
        <p id={`${carouselId}-status`} className={styles.carouselStatus} aria-live="polite" aria-atomic="true">
          <span aria-hidden="true">{activeIndex + 1} / {slides.length}</span>
          <span className="sr-only">전체 {slides.length}장 중 {activeIndex + 1}번째 사진</span>
        </p>
        {slides.length > 1 ? (
          <div className={styles.carouselControls} aria-label={`${label} 이동 컨트롤`}>
            <button type="button" aria-label="이전 사진" aria-controls={`${carouselId}-slide`} onClick={() => move(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <div className={styles.carouselDots} aria-label="사진 바로가기">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`${index + 1}번째 사진 보기`}
                  aria-current={index === activeIndex ? "true" : undefined}
                  data-active={index === activeIndex}
                  onClick={() => setCurrentIndex(index)}
                />
              ))}
            </div>
            <button type="button" aria-label="다음 사진" aria-controls={`${carouselId}-slide`} onClick={() => move(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
