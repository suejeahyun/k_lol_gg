"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  kda: number;
};

type Top3SliderProps = {
  title: string;
  seasonName: string | null;
  players: TopPlayerDto[];
};

type RankingType = "winRate" | "participation" | "kda";

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
    key: "kda",
    title: "KDA TOP 3",
    label: "KDA",
    getValue: (player) => player.kda.toFixed(2),
    getSubValue: () => null,
  },
];

function getSortedPlayers(players: TopPlayerDto[], type: RankingType) {
  return [...players]
    .sort((a, b) => {
      if (type === "winRate") {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.kda !== a.kda) return b.kda - a.kda;
        return b.participation - a.participation;
      }

      if (type === "participation") {
        if (b.participation !== a.participation) {
          return b.participation - a.participation;
        }

        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.kda - a.kda;
      }

      if (b.kda !== a.kda) return b.kda - a.kda;
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

      {players.length === 0 ? (
        <div className="top3-card__empty">표시할 데이터가 없습니다.</div>
      ) : (
        <>
          <div className="top3-slide-header">
            <div>
              <h3 className="top3-slide-header__title">{activeSlide.title}</h3>
              <p className="top3-slide-header__description">
                {activeSlide.label} 기준 상위 3명
              </p>
            </div>

            <span className="top3-slide-header__badge">
              {activeIndex + 1} / {slides.length}
            </span>
          </div>

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