"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const MIN_TOP3_PARTICIPATIONS = 10;

type TopPlayerDto = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  participation: number;
  wins: number;
  losses: number;
  winRate: number;
  mvpCount: number;
};

type Top3SliderProps = {
  title: string;
  seasonName: string | null;
  players: TopPlayerDto[];
};

type RankingType = "winRate" | "participation" | "mvpCount";

type RankingSlide = {
  key: RankingType;
  title: string;
  label: string;
  getValue: (player: TopPlayerDto) => string;
  getSubValue: (player: TopPlayerDto) => string | null;
};

const slides: RankingSlide[] = [
  {
    key: "winRate",
    title: "승률 TOP 3",
    label: "승률",
    getValue: (player) => `${player.winRate}%`,
    getSubValue: (player) => `${player.wins}승 ${player.losses}패`,
  },
  {
    key: "participation",
    title: "최다 참여 TOP 3",
    label: "참여",
    getValue: (player) => `${player.participation}회`,
    getSubValue: (player) => `${player.wins}승 ${player.losses}패`,
  },
  {
    key: "mvpCount",
    title: "MVP TOP 3",
    label: "MVP",
    getValue: (player) => `${player.mvpCount}회`,
    getSubValue: (player) => `${player.wins}승 ${player.losses}패`,
  },
];

function getSortedPlayers(players: TopPlayerDto[], type: RankingType) {
  return players
    .filter((player) => {
      if (player.participation < MIN_TOP3_PARTICIPATIONS) return false;
      if (type === "mvpCount" && player.mvpCount <= 0) return false;

      return true;
    })
    .sort((a, b) => {
      if (type === "winRate") {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
        return b.participation - a.participation;
      }

      if (type === "participation") {
        if (b.participation !== a.participation) {
          return b.participation - a.participation;
        }

        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.mvpCount - a.mvpCount;
      }

      if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.participation - a.participation;
    })
    .slice(0, 3);
}

export default function Top3Slider({
  title,
  seasonName,
  players,
}: Top3SliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeSlide = slides[activeIndex];

  const topPlayers = useMemo(() => {
    return getSortedPlayers(players, activeSlide.key);
  }, [players, activeSlide.key]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="top3-card">
      <div className="top3-card__header">
        <div>
          <div className="top3-card__eyebrow">RANKING</div>
          <h2 className="top3-card__title">{title}</h2>
        </div>

        {seasonName && <span className="top3-card__season">{seasonName}</span>}
      </div>

      {topPlayers.length === 0 ? (
        <div className="top3-card__empty">내전 참여 {MIN_TOP3_PARTICIPATIONS}회 이상 기준에 맞는 데이터가 없습니다.</div>
      ) : (
        <>
          <div className="top3-slide-header">
            <div>
              <h3 className="top3-slide-header__title">{activeSlide.title}</h3>
              <p className="top3-slide-header__description">
                {activeSlide.label} 기준 상위 3명 · 내전 참여 {MIN_TOP3_PARTICIPATIONS}회 이상
              </p>
            </div>

            <span className="top3-slide-header__badge">
              {activeIndex + 1} / {slides.length}
            </span>
          </div>

          {topPlayers.length === 0 ? (
            <div className="top3-card__empty">
              내전 참여 {MIN_TOP3_PARTICIPATIONS}회 이상 조건을 충족한 데이터가 없습니다.
            </div>
          ) : (
            <div className="top3-list">
              {topPlayers.map((player, index) => {
                const subValue = activeSlide.getSubValue(player);

                return (
                <Link
                  key={`${activeSlide.key}-${player.playerId}`}
                  href={`/players/${player.playerId}`}
                  className={`top3-player top3-player--rank-${index + 1}`}
                >
                  <div className="top3-player__rank">{index + 1}</div>

                  <div className="top3-player__body">
                    <div className="top3-player__name">{player.name}</div>
                    <div className="top3-player__nickname">
                      {player.nickname}#{player.tag}
                    </div>
                  </div>

                  <div className="top3-player__result">
                    <strong>{activeSlide.getValue(player)}</strong>
                    {subValue && <span>{subValue}</span>}
                  </div>
                </Link>
                );
              })}
            </div>
          )}

          <div className="top3-pagination">
            {slides.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                className={
                  index === activeIndex
                    ? "top3-pagination__dot top3-pagination__dot--active"
                    : "top3-pagination__dot"
                }
                onClick={() => setActiveIndex(index)}
                aria-label={`${slide.title} 보기`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}