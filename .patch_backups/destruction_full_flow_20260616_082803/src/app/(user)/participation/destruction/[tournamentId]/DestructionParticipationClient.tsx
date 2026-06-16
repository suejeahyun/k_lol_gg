"use client";

import { useEffect, useState } from "react";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;

type ApplyPosition = (typeof POSITIONS)[number];
type CaptainPreference = "PREFERRED" | "NOT_PREFERRED";

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  mainPosition: ApplyPosition | null;
  subPositions: ApplyPosition[];
  isCaptain: boolean;
  captainPreference?: CaptainPreference;
};

type DestructionParticipationClientProps = {
  tournamentId: string;
};

function getCaptainPreferenceLabel(player: Player) {
  const preference = player.captainPreference ?? (player.isCaptain ? "PREFERRED" : "NOT_PREFERRED");
  return preference === "PREFERRED" ? "팀장 선호" : "팀장 비선호";
}

export default function DestructionParticipationClient({
  tournamentId,
}: DestructionParticipationClientProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [mainPosition, setMainPosition] = useState<ApplyPosition | "">("");
  const [subPositions, setSubPositions] = useState<ApplyPosition[]>([]);
  const [captainPreference, setCaptainPreference] =
    useState<CaptainPreference>("NOT_PREFERRED");
  const [loading, setLoading] = useState(false);

  const fetchPlayers = async (targetId: string) => {
    const res = await fetch(`/api/participation/destruction/${targetId}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (res.ok) {
      setPlayers(data.players || []);
    }
  };

  useEffect(() => {
    fetchPlayers(tournamentId).catch((error: unknown) => {
      console.error("[DESTRUCTION_PARTICIPATION_FETCH_ERROR]", error);
    });
  }, [tournamentId]);

  const toggleSubPosition = (position: ApplyPosition) => {
    setSubPositions((prev) =>
      prev.includes(position)
        ? prev.filter((item) => item !== position)
        : [...prev, position]
    );
  };

  const handleApply = async () => {
    if (!mainPosition) {
      alert("포지션을 선택해주세요.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(
        `/api/participation/destruction/${tournamentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mainPosition,
            subPositions,
            captainPreference,
            isCaptain: captainPreference === "PREFERRED",
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "참가 신청 실패");
        return;
      }

      alert("멸망전 참가 신청이 완료되었습니다.");
      await fetchPlayers(tournamentId);
    } catch (error: unknown) {
      console.error("[DESTRUCTION_APPLY_ERROR]", error);
      alert("참가 신청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container participation-detail">
      <div className="page-header">
        <h1 className="page-title">멸망전 참가</h1>
        <p className="page-description">
          포지션과 팀장 선호 여부를 선택해 멸망전에 참가 신청합니다.
        </p>
      </div>

      <div className="participation-box">
        <SinglePositionSelector
          title="포지션"
          value={mainPosition}
          onChange={setMainPosition}
          required
        />

        <MultiPositionSelector
          title="부포지션"
          values={subPositions}
          onToggle={toggleSubPosition}
        />

        <CaptainPreferenceSelector
          value={captainPreference}
          onChange={setCaptainPreference}
        />

        <button
          type="button"
          className="participation-apply-button"
          onClick={() => {
            handleApply().catch((error: unknown) => {
              console.error("[DESTRUCTION_APPLY_PROMISE_ERROR]", error);
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

function CaptainPreferenceSelector({
  value,
  onChange,
}: {
  value: CaptainPreference;
  onChange: (value: CaptainPreference) => void;
}) {
  return (
    <div className="participation-position-section">
      <div className="participation-position-title">
        팀장
        <span>선택</span>
      </div>

      <div className="participation-position-group">
        <button
          type="button"
          className={
            value === "PREFERRED"
              ? "participation-position-button active"
              : "participation-position-button"
          }
          onClick={() => onChange("PREFERRED")}
        >
          팀장 선호
        </button>

        <button
          type="button"
          className={
            value === "NOT_PREFERRED"
              ? "participation-position-button active"
              : "participation-position-button"
          }
          onClick={() => onChange("NOT_PREFERRED")}
        >
          팀장 비선호
        </button>
      </div>

      <p className="page-description" style={{ marginTop: 8 }}>
        팀장 선호는 신청 의사 표시입니다. 최종 팀장은 관리자가 지정합니다.
      </p>
    </div>
  );
}

function ParticipationList({ players }: { players: Player[] }) {
  return (
    <div className="participation-list">
      <h2>현재 참가자</h2>

      <div className="participation-header participation-header--captain">
        <span></span>
        <span>이름</span>
        <span>닉네임#태그</span>
        <span>현재티어</span>
        <span>최고티어</span>
        <span>포지션</span>
        <span>부포지션</span>
        <span>팀장</span>
      </div>

      {players.length === 0 ? (
        <div className="admin-empty">참가 신청자가 없습니다.</div>
      ) : (
        players.map((player, index) => (
          <div
            key={player.id}
            className="participation-item participation-item--captain"
          >
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
            <span>{getCaptainPreferenceLabel(player)}</span>
          </div>
        ))
      )}
    </div>
  );
}
