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

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default function EventParticipationPage({ params }: PageProps) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [mainPosition, setMainPosition] = useState<ApplyPosition | "">("");
  const [subPositions, setSubPositions] = useState<ApplyPosition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    params
      .then((resolved) => {
        setEventId(resolved.eventId);
      })
      .catch((error: unknown) => {
        console.error("[EVENT_PARAM_ERROR]", error);
      });
  }, [params]);

  const fetchPlayers = async (targetId: string) => {
    const res = await fetch(`/api/participation/event/${targetId}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (res.ok) {
      setPlayers(data.players || []);
    }
  };

  useEffect(() => {
    if (!eventId) return;

    fetchPlayers(eventId).catch((error: unknown) => {
      console.error("[EVENT_PARTICIPATION_FETCH_ERROR]", error);
    });
  }, [eventId]);

  const toggleSubPosition = (position: ApplyPosition) => {
    setSubPositions((prev) =>
      prev.includes(position)
        ? prev.filter((item) => item !== position)
        : [...prev, position]
    );
  };

  const handleApply = async () => {
    if (!eventId) return;

    if (!mainPosition) {
      alert("주라인을 선택해주세요.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`/api/participation/event/${eventId}`, {
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

      alert("이벤트 내전 참가 신청이 완료되었습니다.");
      await fetchPlayers(eventId);
    } catch (error: unknown) {
      console.error("[EVENT_APPLY_ERROR]", error);
      alert("참가 신청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container participation-detail">
      <div className="page-header">
        <h1 className="page-title">이벤트 내전 참가</h1>
        <p className="page-description">
          이벤트 내전에 참가 신청합니다. 주라인은 1개, 부라인은 여러 개 선택할 수 있습니다.
        </p>
      </div>

      <div className="participation-box">
        <SinglePositionSelector
          title="주라인"
          value={mainPosition}
          onChange={setMainPosition}
          required
        />

        <MultiPositionSelector
          title="부라인"
          values={subPositions}
          onToggle={toggleSubPosition}
        />

        <button
          type="button"
          className="participation-apply-button"
          onClick={() => {
            handleApply().catch((error: unknown) => {
              console.error("[EVENT_APPLY_PROMISE_ERROR]", error);
            });
          }}
          disabled={loading}
        >
          {loading ? "신청 중..." : "참가하기"}
        </button>
      </div>

      <ParticipationList players={players} />
    </div>
  );
}

function SinglePositionSelector({
  title,
  value,
  onChange,
  required = false,
}: {
  title: string;
  value: ApplyPosition | "";
  onChange: (value: ApplyPosition | "") => void;
  required?: boolean;
}) {
  return (
    <div className="participation-position-section">
      <div className="participation-position-title">
        {title}
        {required ? <span>필수</span> : <span>선택</span>}
      </div>

      <div className="participation-position-group">
        {!required ? (
          <button
            type="button"
            className={
              value === ""
                ? "participation-position-button active"
                : "participation-position-button"
            }
            onClick={() => onChange("")}
          >
            선택 안함
          </button>
        ) : null}

        {POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            className={
              value === pos
                ? "participation-position-button active"
                : "participation-position-button"
            }
            onClick={() => onChange(pos)}
          >
            {pos}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiPositionSelector({
  title,
  values,
  onToggle,
}: {
  title: string;
  values: ApplyPosition[];
  onToggle: (value: ApplyPosition) => void;
}) {
  return (
    <div className="participation-position-section">
      <div className="participation-position-title">
        {title}
        <span>다중 선택</span>
      </div>

      <div className="participation-position-group">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            className={
              values.includes(pos)
                ? "participation-position-button active"
                : "participation-position-button"
            }
            onClick={() => onToggle(pos)}
          >
            {pos}
          </button>
        ))}
      </div>
    </div>
  );
}

function ParticipationList({ players }: { players: Player[] }) {
  return (
    <div className="participation-list">
      <h2>현재 참가자</h2>

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