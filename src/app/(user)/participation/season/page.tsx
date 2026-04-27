"use client";

import { useEffect, useState } from "react";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;

type ApplyPosition = (typeof POSITIONS)[number];

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  mainPosition: ApplyPosition | null;
  subPositions: ApplyPosition[];
};

export default function SeasonParticipationPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [mainPosition, setMainPosition] = useState<ApplyPosition | "">("");
  const [subPositions, setSubPositions] = useState<ApplyPosition[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPlayers = async () => {
    const res = await fetch("/api/participation/season", {
      cache: "no-store",
    });

    const data = await res.json();

    if (res.ok) {
      setPlayers(data.players || []);
    }
  };

  const toggleSubPosition = (position: ApplyPosition) => {
    setSubPositions((prev) =>
      prev.includes(position)
        ? prev.filter((item) => item !== position)
        : [...prev, position]
    );
  };

  const handleApply = async () => {
    if (!mainPosition) {
      alert("주라인을 선택해주세요.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/participation/season", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mainPosition,
          subPositions,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "참가 신청 실패");
        return;
      }

      alert("참가 신청이 완료되었습니다.");
      await fetchPlayers();
    } catch (error: unknown) {
      console.error("[SEASON_APPLY_ERROR]", error);
      alert("참가 신청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers().catch((error: unknown) => {
      console.error("[SEASON_PARTICIPATION_FETCH_ERROR]", error);
    });
  }, []);

  return (
    <div className="page-container participation-detail">
      <div className="page-header">
        <h1 className="page-title">시즌내전 참가</h1>
        <p className="page-description">
          오늘 진행될 시즌내전에 참가 신청합니다. 주라인은 1개, 부라인은 여러 개 선택할 수 있습니다.
        </p>
      </div>

      <div className="participation-box">
        <PositionSelector
          title="주라인"
          selected={mainPosition}
          onSelect={setMainPosition}
          mode="single"
        />

        <PositionSelector
          title="부라인"
          selected={subPositions}
          onToggle={toggleSubPosition}
          mode="multi"
        />

        <button
          type="button"
          className="participation-apply-button"
          onClick={() => {
            handleApply().catch((error: unknown) => {
              console.error("[SEASON_APPLY_PROMISE_ERROR]", error);
            });
          }}
          disabled={loading}
        >
          {loading ? "신청 중..." : "참가하기"}
        </button>
      </div>

      <ParticipationList players={players} title="오늘 참가자" />
    </div>
  );
}

function PositionSelector({
  title,
  selected,
  onSelect,
  onToggle,
  mode,
}: {
  title: string;
  selected: ApplyPosition | "" | ApplyPosition[];
  onSelect?: (value: ApplyPosition) => void;
  onToggle?: (value: ApplyPosition) => void;
  mode: "single" | "multi";
}) {
  return (
    <div className="participation-position-section">
      <div className="participation-position-title">
        {title}
        <span>{mode === "single" ? "1개 선택" : "다중 선택"}</span>
      </div>

      <div className="participation-position-group">
        {POSITIONS.map((position) => {
          const active =
            mode === "single"
              ? selected === position
              : Array.isArray(selected) && selected.includes(position);

          return (
            <button
              key={position}
              type="button"
              className={
                active
                  ? "participation-position-button active"
                  : "participation-position-button"
              }
              onClick={() => {
                if (mode === "single") {
                  onSelect?.(position);
                } else {
                  onToggle?.(position);
                }
              }}
            >
              {position}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ParticipationList({
  players,
  title,
}: {
  players: Player[];
  title: string;
}) {
  return (
    <div className="participation-list">
      <h2>{title}</h2>

      <div className="participation-header">
        <span></span>
        <span>이름</span>
        <span>닉네임#태그</span>
        <span>현재티어</span>
        <span>최고티어</span>
        <span>주라인</span>
        <span>부라인</span>
      </div>

      {players.length === 0 ? (
        <div className="admin-empty">참가 신청자가 없습니다.</div>
      ) : (
        players.map((player, index) => (
          <div key={player.id} className="participation-item">
            <span>{index + 1}</span>
            <strong>{player.name}</strong>
            <em>
              {player.nickname}#{player.tag}
            </em>
            <span>{player.currentTier ?? "-"}</span>
            <span>{player.peakTier ?? "-"}</span>
            <span>{player.mainPosition ?? "-"}</span>
            <span>
              {player.subPositions.length > 0
                ? player.subPositions.join(", ")
                : "-"}
            </span>
          </div>
        ))
      )}
    </div>
  );
}