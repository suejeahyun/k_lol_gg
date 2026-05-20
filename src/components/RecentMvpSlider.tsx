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
          <h2 className="home-section-title">理쒓렐 MVP</h2>
          <p className="home-section-subtitle">
            {dateLabel
              ? `${dateLabel} 湲곗? 紐⑤뱺 ?명듃 MVP`
              : "媛??理쒓렐 ?댁쟾 ?좎쭨 湲곗?"}
          </p>
        </div>

        {activeItem ? (
          <Link href={`/matches/${activeItem.matchId}`} className="chip-button">
            寃쎄린 蹂닿린
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
                {activeItem.matchTitle} 쨌 {activeItem.gameNumber}?명듃 쨌{" "}
                {activeItem.championName}
              </div>

              <div className="home-mvp-date">
                {formatMvpDate(activeItem.matchDate)} 쨌 {activeItem.name}
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
                setActiveIndex(
                  safeActiveIndex === 0
                    ? normalizedItems.length - 1
                    : safeActiveIndex - 1,
                )
              }
              disabled={normalizedItems.length <= 1}
              aria-label="?댁쟾 MVP 蹂닿린"
            >
              ?댁쟾
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
                  aria-label={`${item.gameNumber}?명듃 MVP 蹂닿린`}
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
              aria-label="?ㅼ쓬 MVP 蹂닿린"
            >
              ?ㅼ쓬
            </button>
          </div>
        </>
      ) : (
        <div className="empty-box">理쒓렐 MVP ?곗씠?곌? ?놁뒿?덈떎.</div>
      )}
    </div>
  );
}
