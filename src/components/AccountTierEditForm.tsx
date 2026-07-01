"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AccountTierEditFormProps = {
  player: {
    nickname: string;
    tag: string;
    peakTier: string | null;
    currentTier: string | null;
  } | null;
};

type TierEditValue = {
  tier: string;
  division: string;
  score: string;
};

const LOW_TIERS = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아"] as const;
const MASTER_PLUS_TIERS = ["마스터", "그랜드마스터", "챌린저"] as const;
const ALL_TIERS = [...LOW_TIERS, ...MASTER_PLUS_TIERS] as const;
const DIVISIONS = ["4", "3", "2", "1"] as const;

const ENGLISH_TIER_MAP: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};

function emptyTierValue(): TierEditValue {
  return {
    tier: "",
    division: "",
    score: "",
  };
}

function normalizeTierText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function isMasterPlusTier(tier: string) {
  return MASTER_PLUS_TIERS.includes(tier as (typeof MASTER_PLUS_TIERS)[number]);
}

function parseSavedTier(value: string | null | undefined): TierEditValue {
  const text = normalizeTierText(value);
  if (!text) return emptyTierValue();

  const upperText = text.toUpperCase();
  const tier = ALL_TIERS.find((item) => text.includes(item))
    ?? Object.entries(ENGLISH_TIER_MAP).find(([english]) => upperText.includes(english))?.[1]
    ?? "";

  if (!tier) return emptyTierValue();

  if (isMasterPlusTier(tier)) {
    const scoreMatch = text.match(/(\d{1,4})/);
    return {
      tier,
      division: "",
      score: scoreMatch?.[1] ?? "",
    };
  }

  const divisionMatch = text.match(/\b([1-4])\b|([1-4])\s*(?:티어|단계|층)/);
  return {
    tier,
    division: divisionMatch?.[1] ?? divisionMatch?.[2] ?? "",
    score: "",
  };
}

function formatTierValue(value: TierEditValue) {
  if (!value.tier) return null;

  if (isMasterPlusTier(value.tier)) {
    const score = value.score.trim();
    return score ? `${value.tier} ${score}점` : value.tier;
  }

  if (!value.division) return value.tier;
  return `${value.tier} ${value.division}`;
}

function validateTierValue(label: string, value: TierEditValue) {
  if (!value.tier && !value.division && !value.score) return null;
  if (!value.tier) return `${label}의 티어를 선택해 주세요.`;

  if (isMasterPlusTier(value.tier)) {
    const score = value.score.trim();
    if (!score) return `${label}의 점수를 입력해 주세요.`;
    if (!/^\d{1,4}$/.test(score)) return `${label}의 점수는 숫자만 입력해 주세요.`;
    return null;
  }

  if (!value.division) return `${label}의 단계를 선택해 주세요.`;
  return null;
}

type TierPickerProps = {
  label: string;
  description: string;
  value: TierEditValue;
  disabled: boolean;
  onChange: (nextValue: TierEditValue) => void;
};

function TierPicker({ label, description, value, disabled, onChange }: TierPickerProps) {
  const isMasterPlus = isMasterPlusTier(value.tier);

  const handleTierChange = (nextTier: string) => {
    const nextIsMasterPlus = isMasterPlusTier(nextTier);

    onChange({
      tier: nextTier,
      division: nextIsMasterPlus ? "" : value.division,
      score: nextIsMasterPlus ? value.score : "",
    });
  };

  return (
    <section className="account-tier-picker">
      <div className="account-tier-picker__head">
        <strong>{label}</strong>
        <p>{description}</p>
      </div>

      <div className="account-tier-picker__row">
        <label className="account-tier-form__field">
          <span>티어</span>
          <select
            value={value.tier}
            onChange={(event) => handleTierChange(event.target.value)}
            disabled={disabled}
          >
            <option value="">선택 안 함</option>
            {ALL_TIERS.map((tier) => (
              <option key={tier} value={tier}>{tier}</option>
            ))}
          </select>
        </label>

        {isMasterPlus ? (
          <label className="account-tier-form__field">
            <span>점수</span>
            <div className="account-tier-score-input">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={value.score}
                onChange={(event) => onChange({ ...value, division: "", score: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                placeholder="예: 150"
                disabled={disabled}
              />
              <em>점</em>
            </div>
          </label>
        ) : (
          <label className="account-tier-form__field">
            <span>단계</span>
            <select
              value={value.division}
              onChange={(event) => onChange({ ...value, score: "", division: event.target.value })}
              disabled={disabled || !value.tier}
            >
              <option value="">선택</option>
              {DIVISIONS.map((division) => (
                <option key={division} value={division}>{division}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}

export default function AccountTierEditForm({ player }: AccountTierEditFormProps) {
  const router = useRouter();
  const [peakTier, setPeakTier] = useState<TierEditValue>(() => parseSavedTier(player?.peakTier));
  const [currentTier, setCurrentTier] = useState<TierEditValue>(() => parseSavedTier(player?.currentTier));
  const [loading, setLoading] = useState(false);

  const disabled = !player || loading;

  const preview = useMemo(() => {
    return {
      currentTier: formatTierValue(currentTier) ?? "-",
      peakTier: formatTierValue(peakTier) ?? "-",
    };
  }, [currentTier, peakTier]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!player) {
      alert("연결된 플레이어가 없어 티어를 수정할 수 없습니다.");
      return;
    }

    const currentTierError = validateTierValue("현재티어", currentTier);
    const peakTierError = validateTierValue("최고티어", peakTier);
    if (currentTierError || peakTierError) {
      alert(currentTierError || peakTierError);
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/my-player", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: player.nickname,
          tag: player.tag,
          peakTier: formatTierValue(peakTier),
          currentTier: formatTierValue(currentTier),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "티어 수정 실패");
        return;
      }

      alert("현재티어와 최고티어를 저장했습니다.");
      router.refresh();
    } catch (error) {
      console.error("[ACCOUNT_TIER_UPDATE_ERROR]", error);
      alert("티어 수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="account-tier-form account-tier-form--dropdown" onSubmit={handleSubmit}>
      <div className="account-form-section__title">
        <span>TIER</span>
        <strong>현재티어 / 최고티어 변경</strong>
        <p>티어를 선택하면 다이아 이하는 단계, 마스터 이상은 점수 입력으로 자동 전환됩니다.</p>
      </div>

      <div className="account-tier-form__preview">
        <div>
          <span>저장될 현재티어</span>
          <strong>{preview.currentTier}</strong>
        </div>
        <div>
          <span>저장될 최고티어</span>
          <strong>{preview.peakTier}</strong>
        </div>
      </div>

      <div className="account-tier-form__stack">
        <TierPicker
          label="현재티어"
          description="현재 솔로랭크 또는 사이트 기준 티어입니다."
          value={currentTier}
          disabled={disabled}
          onChange={setCurrentTier}
        />
        <TierPicker
          label="최고티어"
          description="기록에 남길 최고 도달 티어입니다."
          value={peakTier}
          disabled={disabled}
          onChange={setPeakTier}
        />
      </div>

      {!player ? (
        <p className="account-tier-form__notice">연결된 플레이어가 없어 수정할 수 없습니다. 관리자에게 플레이어 연결을 요청하세요.</p>
      ) : (
        <p className="account-tier-form__notice">저장 예시: 다이아 2, 마스터 150점, 그랜드마스터 420점, 챌린저 900점</p>
      )}

      <div className="account-tier-form__actions">
        <button className="admin-button" type="submit" disabled={disabled}>
          {loading ? "저장 중..." : "티어 저장"}
        </button>
      </div>
    </form>
  );
}
