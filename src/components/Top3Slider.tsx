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

type MetricKey = "winRate" | "kda" | "participation";

export default function Top3Slider({
  title,
  seasonName,
  players = [],
}: Props) {
  const safePlayers = Array.isArray(players) ? players : [];
  const [index, setIndex] = useState(0);

  const metrics = useMemo(
    () =>
      [
        { key: "winRate", label: "승률" },
        { key: "kda", label: "KDA" },
        { key: "participation", label: "최다 참여" },
      ] as const satisfies ReadonlyArray<{
        key: MetricKey;
        label: string;
      }>,
    []
  );

  const current = metrics[index];

  const rankedPlayers = useMemo(() => {
    const copied = [...safePlayers];

    return copied.sort((a, b) => {
      if (current.key === "winRate") {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.participation !== a.participation) {
          return b.participation - a.participation;
        }
        if (b.kda !== a.kda) return b.kda - a.kda;
        return a.nickname.localeCompare(b.nickname);
      }

      if (current.key === "kda") {
        if (b.kda !== a.kda) return b.kda - a.kda;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.participation !== a.participation) {
          return b.participation - a.participation;
        }
        return a.nickname.localeCompare(b.nickname);
      }

      if (b.participation !== a.participation) {
        return b.participation - a.participation;
      }
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.kda !== a.kda) return b.kda - a.kda;
      return a.nickname.localeCompare(b.nickname);
    });
  }, [safePlayers, current.key]);

  const top3Players = rankedPlayers.slice(0, 3);

  const getValueText = (player: TopPlayer) => {
    if (current.key === "winRate") {
      return `${player.winRate}%`;
    }

    if (current.key === "kda") {
      return `${player.kda}`;
    }

    return `${player.participation}회`;
  };

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

      {top3Players.length === 0 ? (
        <div className="top3-empty">표시할 데이터가 없습니다.</div>
      ) : (
        <div className="top3-rank-list">
          {top3Players.map((p, i) => (
            <div key={p.playerId} className="top3-rank-card">
              <div className="top3-rank-card__place">{i + 1}위</div>
              <div className="top3-rank-card__name">
                {p.nickname}#{p.tag}
              </div>
              <div className="top3-rank-card__value">
                {current.label}: {getValueText(p)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}