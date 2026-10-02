"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Crown, Medal, Pause, Play, Trophy } from "@/components/theme/theme-icons";
import { Button } from "@/components/ui/button";
import type { PublicRankingView } from "@/modules/statistics/domain/public-ranking-view";
import styles from "./home-ranking-carousel.module.css";

type RankingSlide = Readonly<{
  id: PublicRankingView;
  label: string;
  description: string;
  metricLabel: string;
  rows: readonly Readonly<{ playerId: string; displayName: string; riotId: string; value: string }>[];
}>;

export function HomeRankingCarousel({ slides, seasonName, minimumParticipation }: { slides: readonly RankingSlide[]; seasonName: string; minimumParticipation: number }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const slideId = useId();
  const active = slides[index % slides.length];
  const nextSlide = slides[(index + 1) % slides.length];
  const canMove = slides.length > 1;

  useEffect(() => {
    if (!playing || hovered || !canMove) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((current) => (current + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [playing, hovered, canMove, slides.length]);

  function move(direction: number) {
    setPlaying(false);
    setIndex((current) => (current + direction + slides.length) % slides.length);
  }

  if (!active) return null;

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="캐러셀"
      aria-label={`${seasonName} 랭킹`}
      data-ranking-kind={active.id}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (!(event.target as HTMLElement).closest("[data-rotation-control]")) setPlaying(false);
      }}
      onKeyDown={(event) => {
        if (!canMove || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <div className={styles.orbit} aria-hidden="true" />
      <Trophy className={styles.watermark} aria-hidden="true" strokeWidth={0.7} />
      <div className={styles.topline}>
        <span className={styles.eyebrow}><span /> SEASON SPOTLIGHT</span>
        <span className={styles.counter}><strong>{String(index % slides.length + 1).padStart(2, "0")}</strong> / {String(slides.length).padStart(2, "0")}</span>
      </div>

      <div id={slideId} aria-live={playing ? "off" : "polite"} aria-atomic="true">
        <div
          key={active.id}
          className={styles.slide}
          role="group"
          aria-roledescription="슬라이드"
          aria-label={`${index % slides.length + 1} / ${slides.length} · ${active.label}`}
          onPointerDown={(event) => {
            swiped.current = false;
            if (event.pointerType !== "mouse" && canMove) start.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerCancel={() => { start.current = null; }}
          onPointerUp={(event) => {
            if (!start.current) return;
            const dx = event.clientX - start.current.x, dy = event.clientY - start.current.y;
            start.current = null;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              swiped.current = true;
              move(dx < 0 ? 1 : -1);
            }
          }}
          onClickCapture={(event) => { if (swiped.current) { event.preventDefault(); swiped.current = false; } }}
        >
          <div className={styles.intro}>
            <span className={styles.category}>{seasonName} · TOP 3</span>
            <h3>{active.label}</h3>
            <p>{minimumParticipation}회 이상 참여 · {active.description}</p>
          </div>
          <ol className={styles.podium}>
            {active.rows.map((row, rank) => (
              <li key={row.playerId} data-rank={rank + 1} className={styles.place}>
                <Link className={styles.player} href={`/players/${row.playerId}`}>
                  <span className={styles.medal} aria-hidden="true">{rank === 0 ? <Crown /> : <Medal />}</span>
                  <span className={styles.rank}>{rank === 0 ? "CHAMPION" : `0${rank + 1}`}<span className="sr-only"> · {rank + 1}위</span></span>
                  <strong className={styles.name} title={row.displayName}>{row.displayName}</strong>
                  <span className={styles.riotId} title={row.riotId}>{row.riotId}</span>
                  <span className={styles.metric}><strong>{row.value}</strong><span>{active.metricLabel}</span></span>
                  <span className={styles.profile}>전적 보기 <ArrowRight size={14} aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className={styles.bottomline}>
        <div className={styles.footerLinks}>
        <Link className={styles.allRankings} href={`/rankings?view=${active.id}`}>전체 {active.label} 순위 <ArrowRight size={16} aria-hidden="true" /></Link>
      {canMove ? <button type="button" className={styles.nextHint} onClick={() => move(1)} aria-controls={slideId}>다음: {nextSlide.label} <ArrowRight size={18} aria-hidden="true" /></button> : null}
        </div>
        {canMove ? <div className={styles.controls}>
          <Button className={styles.control} variant="ghost" size="icon" onClick={() => move(-1)} aria-label="이전 랭킹" aria-controls={slideId}><ChevronLeft aria-hidden="true" /></Button>
          <div className={styles.dots} role="group" aria-label="랭킹 슬라이드 선택">
            {slides.map((slide, slideIndex) => <Button className={styles.dot} variant="ghost" size="icon" key={slide.id} onClick={() => { setPlaying(false); setIndex(slideIndex); }} aria-label={`${slideIndex + 1}번 ${slide.label} 랭킹`} aria-current={active.id === slide.id ? "true" : undefined} aria-controls={slideId}><span /></Button>)}
          </div>
          <Button className={styles.control} variant="ghost" size="icon" onClick={() => move(1)} aria-label="다음 랭킹" aria-controls={slideId}><ChevronRight aria-hidden="true" /></Button>
          <Button className={styles.control} variant="ghost" size="icon" data-rotation-control onClick={() => setPlaying((value) => !value)} aria-label={playing ? "자동 넘김 정지" : "자동 넘김 시작"} aria-controls={slideId}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</Button>
        </div> : null}
      </div>
    </div>
  );
}
