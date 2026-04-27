"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TierType = "basic" | "master" | "high";

type Player = {
  id: number;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
};

const BASIC_TIERS = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아"];
const MASTER_TIERS = ["마스터"];
const HIGH_TIERS = ["그랜드마스터", "챌린저"];
const BASIC_DIVISIONS = ["1", "2", "3", "4"];
const MASTER_FLOORS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const ALL_TIERS = [...BASIC_TIERS, ...MASTER_TIERS, ...HIGH_TIERS];

function getTierType(tier: string): TierType {
  if (BASIC_TIERS.includes(tier)) return "basic";
  if (MASTER_TIERS.includes(tier)) return "master";
  return "high";
}

function buildTierValue(tier: string, detail: string): string {
  if (!tier) return "";
  if (BASIC_TIERS.includes(tier)) return detail ? `${tier} ${detail}` : "";
  if (MASTER_TIERS.includes(tier)) return detail ? `${tier} ${detail}층` : "";
  if (HIGH_TIERS.includes(tier)) return detail ? `${tier} ${detail}` : "";
  return "";
}

function parseTierValue(value?: string | null): {
  tier: string;
  detail: string;
} {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return {
      tier: "",
      detail: "",
    };
  }

  const [tier, detailRaw] = normalized.split(" ");
  const detail = detailRaw?.replace("층", "") ?? "";

  if (![...BASIC_TIERS, ...MASTER_TIERS, ...HIGH_TIERS].includes(tier)) {
    return {
      tier: "",
      detail: "",
    };
  }

  return {
    tier,
    detail,
  };
}

export default function MyPlayerPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");

  const [peakTier, setPeakTier] = useState("");
  const [peakDetail, setPeakDetail] = useState("");
  const [currentTier, setCurrentTier] = useState("");
  const [currentDetail, setCurrentDetail] = useState("");

  const peakType = useMemo(() => getTierType(peakTier), [peakTier]);
  const currentType = useMemo(() => getTierType(currentTier), [currentTier]);

  const fetchPlayer = async () => {
    try {
      const res = await fetch("/api/my-player", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "내 정보 조회 실패");
        return;
      }

      setPlayer(data.player);

      if (data.player) {
        setNickname(data.player.nickname);
        setTag(data.player.tag);

        const parsedPeak = parseTierValue(data.player.peakTier);
        setPeakTier(parsedPeak.tier);
        setPeakDetail(parsedPeak.detail);

        const parsedCurrent = parseTierValue(data.player.currentTier);
        setCurrentTier(parsedCurrent.tier);
        setCurrentDetail(parsedCurrent.detail);
      }
    } catch (error: unknown) {
      console.error("[MY_PLAYER_FETCH_ERROR]", error);
      alert("내 정보를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);

      const res = await fetch("/api/my-player", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname,
          tag,
          peakTier: buildTierValue(peakTier, peakDetail),
          currentTier: buildTierValue(currentTier, currentDetail),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "수정 실패");
        return;
      }

      alert("수정 완료");
      await fetchPlayer();
    } catch (error: unknown) {
      console.error("[MY_PLAYER_UPDATE_ERROR]", error);
      alert("수정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchPlayer().catch((error: unknown) => {
      console.error("[MY_PLAYER_FETCH_PROMISE_ERROR]", error);
    });
  }, []);

  if (loading) {
    return <div className="admin-empty">정보를 불러오는 중입니다.</div>;
  }

  if (!player) {
    return <div className="admin-empty">플레이어 정보가 없습니다.</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">내 플레이어 정보</h1>
      </div>

      <form className="admin-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>닉네임</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>

        <label className="auth-field">
          <span>태그</span>
          <input value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>

        <TierSelector
          title="최고 티어"
          tier={peakTier}
          detail={peakDetail}
          type={peakType}
          onTierChange={(value) => {
            setPeakTier(value);
            setPeakDetail("");
          }}
          onDetailChange={setPeakDetail}
        />

        <TierSelector
          title="현재 티어"
          tier={currentTier}
          detail={currentDetail}
          type={currentType}
          onTierChange={(value) => {
            setCurrentTier(value);
            setCurrentDetail("");
          }}
          onDetailChange={setCurrentDetail}
        />

        <button className="auth-button" type="submit" disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
    </div>
  );
}

function TierSelector({
  title,
  tier,
  detail,
  type,
  onTierChange,
  onDetailChange,
}: {
  title: string;
  tier: string;
  detail: string;
  type: TierType;
  onTierChange: (value: string) => void;
  onDetailChange: (value: string) => void;
}) {
  return (
    <div className="auth-tier-section">
      <div className="auth-tier-title">{title}</div>

      <div className="auth-tier-row">
        <select value={tier} onChange={(e) => onTierChange(e.target.value)}>
          <option value="">선택 안함</option>
          {ALL_TIERS.map((tierName) => (
            <option key={tierName} value={tierName}>
              {tierName}
            </option>
          ))}
        </select>

        {tier && type === "basic" ? (
          <select value={detail} onChange={(e) => onDetailChange(e.target.value)}>
            <option value="">단계 선택</option>
            {BASIC_DIVISIONS.map((division) => (
              <option key={division} value={division}>
                {division}
              </option>
            ))}
          </select>
        ) : null}

        {tier && type === "master" ? (
          <select value={detail} onChange={(e) => onDetailChange(e.target.value)}>
            <option value="">층 선택</option>
            {MASTER_FLOORS.map((floor) => (
              <option key={floor} value={floor}>
                {floor}층
              </option>
            ))}
          </select>
        ) : null}

        {tier && type === "high" ? (
          <input
            value={detail}
            onChange={(e) => onDetailChange(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="LP 입력"
            inputMode="numeric"
          />
        ) : null}
      </div>
    </div>
  );
}