"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import styles from "./media.module.css";
import { ResilientMediaImage } from "./resilient-media-image";
import { stepMediaCarouselIndex, stepMediaCarouselWheelIndex } from "./media-carousel-state";

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
  const carouselRef = useRef<HTMLElement>(null);
  const currentIndexRef = useRef(0);
  const wheelLockRef = useRef(0);
  const activeIndex = slides.length > 0 ? currentIndex % slides.length : 0;
  const activeSlide = slides[activeIndex];

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || slides.length <= 1) return;

    function handleWheel(event: WheelEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (Math.abs(event.deltaY) < 18 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const direction: -1 | 1 = event.deltaY < 0 ? -1 : 1;
      const now = performance.now();
      const nextIndex = stepMediaCarouselWheelIndex(currentIndexRef.current, direction, slides.length);
      if (nextIndex === currentIndexRef.current) return;

      event.preventDefault();
      if (now - wheelLockRef.current < 220) return;
      wheelLockRef.current = now;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
    }

    carousel.addEventListener("wheel", handleWheel, { passive: false });
    return () => carousel.removeEventListener("wheel", handleWheel);
  }, [slides.length]);

  if (!activeSlide) return null;

  function move(direction: -1 | 1) {
    setCurrentIndex((index) => {
      const nextIndex = stepMediaCarouselIndex(index, direction, slides.length);
      currentIndexRef.current = nextIndex;
      return nextIndex;
    });
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
      ref={carouselRef}
      className={styles.mediaCarousel}
      data-variant={variant}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={`${carouselId}-status ${carouselId}-wheel-hint`}
      onKeyDown={handleKeyDown}
    >
      {slides.length > 1 ? <span className={styles.carouselWheelHint} aria-hidden="true">휠로 넘기기</span> : null}
      <figure
        key={activeSlide.id}
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

      {slides.length > 1 ? <span id={`${carouselId}-wheel-hint`} className="sr-only">마우스 휠, 좌우 화살표 키 또는 이동 버튼으로 사진을 넘길 수 있습니다.</span> : null}

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
                  onClick={() => {
                    currentIndexRef.current = index;
                    setCurrentIndex(index);
                  }}
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
