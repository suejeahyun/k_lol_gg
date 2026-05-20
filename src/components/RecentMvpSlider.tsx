"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SafeChampionImage from "@/components/SafeChampionImage";

type RecentMvpItem = {
  key: string;
  matchId: number;
  matchTitle: string;
  matchDate: string;
  gameNumber: number;
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  championName: string;
  championImageUrl: string | null;
  kills: number;
  deaths: number;
  assists: number;
  mvpScore: number;
  isWin: boolean;
};

type RecentMvpSliderProps = {
  items: RecentMvpItem[];
  dateLabel: string | null;
};

function formatMvpDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function RecentMvpSlider({
  items,
  dateLabel,
}: RecentMvpSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (b.matchDate !== a.matchDate) {
        return b.matchDate.localeCompare(a.matchDate);
      }

      if (a.matchId !== b.matchId) {
        return b.matchId - a.matchId;
      }

      return a.gameNumber - b.gameNumber;
    });
  }, [items]);

  const safeActiveIndex =
    normalizedItems.length === 0
      ? 0
      : Math.min(activeIndex, normalizedItems.length - 1);

  const activeItem = normalizedItems[safeActiveIndex] ?? null;

  useEffect(() => {
    if (normalizedItems.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % normalizedItems.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [normalizedItems.length]);

  return (
    <div className="card home-mvp-card">
      <div className="home-section-head">
        <div>
          <p className="home-eyebrow">RECENT MVP</p>
          <h2 className="home-section-title">최근 MVP</h2>
          <p className="home-section-subtitle">
            {dateLabel
              ? `${dateLabel} 기준 모든 세트 MVP`
              : "가장 최근 내전 날짜 기준"}
          </p>
        </div>

        {activeItem ? (
          <Link href={`/matches/${activeItem.matchId}`} className="chip-button">
            경기 보기
          </Link>
        ) : null}
      </div>

      {activeItem ? (
        <>
          <div className="home-mvp-content home-mvp-content--slide">
            <div className="home-mvp-champion">
              <SafeChampionImage
                src={activeItem.championImageUrl}
                alt={activeItem.championName}
                width={72}
                height={72}
                className="home-mvp-champion__image"
                fallbackClassName="home-mvp-champion__fallback"
              />
            </div>

            <div className="home-mvp-info">
              <div className="home-mvp-name">
                {activeItem.nickname}
                <span>#{activeItem.tag}</span>
              </div>

              <div className="home-mvp-meta">
                {activeItem.matchTitle} · {activeItem.gameNumber}세트 ·{" "}
                {activeItem.championName}
              </div>

              <div className="home-mvp-date">
                {formatMvpDate(activeItem.matchDate)} · {activeItem.name}
              </div>
            </div>

            <div className="home-mvp-score">
              <strong>{activeItem.mvpScore.toFixed(1)}</strong>
              <span>
                {activeItem.kills}/{activeItem.deaths}/{activeItem.assists}
              </span>
              <em>{activeItem.isWin ? "WIN" : "LOSE"}</em>
            </div>
          </div>

          <div className="home-mvp-slider-footer">
            <button
              type="button"
              className="home-mvp-nav-button"
              onClick={() =>
                setActiveIndex((prev) =>
                  safeActiveIndex === 0
                    ? normalizedItems.length - 1
                    : safeActiveIndex - 1,
                )
              }
              disabled={normalizedItems.length <= 1}
              aria-label="이전 MVP 보기"
            >
              이전
            </button>

            <div className="home-mvp-pagination">
              {normalizedItems.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  className={
                    index === safeActiveIndex
                      ? "home-mvp-pagination__dot home-mvp-pagination__dot--active"
                      : "home-mvp-pagination__dot"
                  }
                  onClick={() => setActiveIndex(index)}
                  aria-label={`${item.gameNumber}세트 MVP 보기`}
                />
              ))}
            </div>

            <button
              type="button"
              className="home-mvp-nav-button"
              onClick={() =>
                setActiveIndex((prev) => (prev + 1) % normalizedItems.length)
              }
              disabled={normalizedItems.length <= 1}
              aria-label="다음 MVP 보기"
            >
              다음
            </button>
          </div>
        </>
      ) : (
        <div className="empty-box">최근 MVP 데이터가 없습니다.</div>
      )}
    </div>
  );
}