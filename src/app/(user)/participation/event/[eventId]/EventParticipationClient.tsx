"use client";

import { useEffect, useMemo, useState } from "react";

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

type EventParticipationClientProps = {
  eventId: string;
};

function getPositionLabel(position: ApplyPosition) {
  const labels: Record<ApplyPosition, string> = {
    TOP: "탑",
    JGL: "정글",
    MID: "미드",
    ADC: "원딜",
    SUP: "서폿",
    ALL: "올라운더",
  };

  return labels[position];
}

export default function EventParticipationClient({
  eventId,
}: EventParticipationClientProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [mainPosition, setMainPosition] = useState<ApplyPosition | "">("");
  const [subPositions, setSubPositions] = useState<ApplyPosition[]>([]);
  const [loading, setLoading] = useState(false);

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
    fetchPlayers(eventId).catch((error: unknown) => {
      console.error("[EVENT_PARTICIPATION_FETCH_ERROR]", error);
    });
  }, [eventId]);

  const positionCounts = useMemo(() => {
    const counts = new Map<ApplyPosition, number>();
    for (const position of POSITIONS) counts.set(position, 0);

    for (const player of players) {
      if (player.mainPosition) {
        counts.set(player.mainPosition, (counts.get(player.mainPosition) ?? 0) + 1);
      }
    }

    return counts;
  }, [players]);

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
    <div className="page-container participation-detail event-participation-page">
      <section className="event-user-hero event-participation-hero">
        <div>
          <p className="page-eyebrow">EVENT MATCH APPLY</p>
          <h1>이벤트 내전 참가</h1>
          <p>
            주라인과 부라인을 선택해 참가 신청합니다. 신청 후 관리자가 참가자를 확정합니다.
          </p>
        </div>
      </section>

      <section className="event-user-summary-grid">
        <div className="event-user-summary-card">
          <span>현재 신청</span>
          <strong>{players.length}명</strong>
        </div>
        {POSITIONS.slice(0, 5).map((position) => (
          <div key={position} className="event-user-summary-card">
            <span>{position}</span>
            <strong>{positionCounts.get(position) ?? 0}명</strong>
          </div>
        ))}
      </section>

      <section className="event-apply-layout">
        <div className="event-apply-panel">
          <div className="section-header">
            <h2>참가 신청</h2>
          </div>

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
            className="participation-apply-button event-apply-submit"
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
      </section>
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
    <div className="participation-position-section event-position-section">
      <div className="participation-position-title">
        {title}
        {required ? <span>필수</span> : <span>선택</span>}
      </div>

      <div className="participation-position-group event-position-group">
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
            <strong>{pos}</strong>
            <span>{getPositionLabel(pos)}</span>
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
    <div className="participation-position-section event-position-section">
      <div className="participation-position-title">
        {title}
        <span>다중 선택</span>
      </div>

      <div className="participation-position-group event-position-group">
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
            <strong>{pos}</strong>
            <span>{getPositionLabel(pos)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ParticipationList({ players }: { players: Player[] }) {
  return (
    <div className="participation-list event-apply-list">
      <div className="section-header">
        <h2>현재 참가 신청자</h2>
      </div>

      {players.length === 0 ? (
        <div className="admin-empty">참가 신청자가 없습니다.</div>
      ) : (
        <div className="event-user-table-wrap">
          <table className="event-user-table">
            <thead>
              <tr>
                <th>No</th>
                <th>이름</th>
                <th>닉네임#태그</th>
                <th>현재티어</th>
                <th>최고티어</th>
                <th>주라인</th>
                <th>부라인</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr key={player.id}>
                  <td>{index + 1}</td>
                  <td>{player.name}</td>
                  <td>
                    {player.nickname}#{player.tag}
                  </td>
                  <td>{player.currentTier ?? "-"}</td>
                  <td>{player.peakTier ?? "-"}</td>
                  <td>{player.mainPosition ?? "-"}</td>
                  <td>
                    {player.subPositions.length > 0
                      ? player.subPositions.join(", ")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
