"use client";

import { useMemo, useState } from "react";

type TopPlayer = {
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

type Props = {
  title: string;
  seasonName?: string | null;
  players?: TopPlayer[];
};

export default function Top3Slider({
  title,
  seasonName,
  players = [],
}: Props) {
  const safePlayers = Array.isArray(players) ? players : [];
  const [index, setIndex] = useState(0);

  const metrics = useMemo(
    () => [
      { label: "승률", get: (p: TopPlayer) => `${p.winRate}%` },
      { label: "KDA", get: (p: TopPlayer) => `${p.kda}` },
      { label: "최다 참여", get: (p: TopPlayer) => `${p.participation}회` },
    ],
    []
  );

  const current = metrics[index];

  return (
    <div className="top3-panel">
      <div className="top3-panel__head">
        <div>
          <div className="top3-panel__title">{title}</div>
          <div className="top3-panel__season">{seasonName ?? "시즌 없음"}</div>
        </div>

        <div className="top3-slider__controls">
          <button
            type="button"
            className="top3-slider__button"
            onClick={() =>
              setIndex(index === 0 ? metrics.length - 1 : index - 1)
            }
          >
            ◀
          </button>

          <div className="top3-slider__metric">{current.label}</div>

          <button
            type="button"
            className="top3-slider__button"
            onClick={() =>
              setIndex(index === metrics.length - 1 ? 0 : index + 1)
            }
          >
            ▶
          </button>
        </div>
      </div>

      {safePlayers.length === 0 ? (
        <div className="top3-empty">표시할 데이터가 없습니다.</div>
      ) : (
        <div className="top3-rank-list">
          {safePlayers.map((p, i) => (
            <div key={p.playerId} className="top3-rank-card">
              <div className="top3-rank-card__place">{i + 1}위</div>
              <div className="top3-rank-card__name">
                {p.nickname}#{p.tag}
              </div>
              <div className="top3-rank-card__value">
                {current.label}: {current.get(p)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}