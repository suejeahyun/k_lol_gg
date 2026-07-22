"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PreliminaryFormat =
  | "FULL_ROUND_ROBIN_BO3"
  | "FULL_ROUND_ROBIN_BO1"
  | "GROUP_ROUND_ROBIN_BO3"
  | "GROUP_ROUND_ROBIN_BO1"
  | "SWISS_ROUND_BO3"
  | "SWISS_ROUND_BO1"
  | "RANDOM_ROUNDS_BO3"
  | "RANDOM_ROUNDS_BO1";

const PRELIMINARY_FORMAT_OPTIONS: { value: PreliminaryFormat; label: string; description: string }[] = [
  {
    value: "FULL_ROUND_ROBIN_BO3",
    label: "전체 풀리그 BO3 · 기본값",
    description: "모든 팀이 한 번씩 3판 2선승제로 경기합니다.",
  },
  {
    value: "FULL_ROUND_ROBIN_BO1",
    label: "전체 풀리그 BO1",
    description: "모든 팀이 한 번씩 단판으로 경기합니다.",
  },
  {
    value: "GROUP_ROUND_ROBIN_BO3",
    label: "조별 풀리그 BO3",
    description: "팀을 2개 조로 나눠 조 안에서 3판 2선승제로 경기합니다.",
  },
  {
    value: "GROUP_ROUND_ROBIN_BO1",
    label: "조별 풀리그 BO1",
    description: "팀을 2개 조로 나눠 조 안에서 단판으로 경기합니다.",
  },
  {
    value: "SWISS_ROUND_BO3",
    label: "스위스 N라운드 BO3",
    description: "관리자가 정한 라운드 수만큼 스위스 방식 라운드를 생성합니다.",
  },
  {
    value: "SWISS_ROUND_BO1",
    label: "스위스 N라운드 BO1",
    description: "관리자가 정한 라운드 수만큼 스위스 방식 단판 라운드를 생성합니다.",
  },
  {
    value: "RANDOM_ROUNDS_BO3",
    label: "랜덤 N라운드 BO3",
    description: "관리자가 정한 라운드 수만큼 랜덤 매칭을 생성합니다.",
  },
  {
    value: "RANDOM_ROUNDS_BO1",
    label: "랜덤 N라운드 BO1",
    description: "관리자가 정한 라운드 수만큼 랜덤 단판 매칭을 생성합니다.",
  },
];

const LANE_LIMIT_KEYS = [
  "topLaneLimit",
  "jungleLaneLimit",
  "midLaneLimit",
  "adcLaneLimit",
  "supportLaneLimit",
] as const;

type LaneLimitKey = (typeof LANE_LIMIT_KEYS)[number];

function usesRoundCount(format: PreliminaryFormat) {
  return format.startsWith("SWISS_ROUND") || format.startsWith("RANDOM_ROUNDS");
}

function parseLaneLimit(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) return null;
  return parsed;
}

export default function AdminDestructionTournamentNewPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [preliminaryFormat, setPreliminaryFormat] = useState<PreliminaryFormat>("FULL_ROUND_ROBIN_BO3");
  const [preliminaryRoundCount, setPreliminaryRoundCount] = useState("3");
  const [laneLimit, setLaneLimit] = useState("10");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedFormat = useMemo(
    () => PRELIMINARY_FORMAT_OPTIONS.find((option) => option.value === preliminaryFormat),
    [preliminaryFormat],
  );

  const shouldShowRoundCount = usesRoundCount(preliminaryFormat);

  const handleSubmit = async () => {
    setError("");

    if (!title.trim()) {
      setError("멸망전명을 입력해주세요.");
      return;
    }

    if (shouldShowRoundCount) {
      const roundCount = Number(preliminaryRoundCount);
      if (!Number.isInteger(roundCount) || roundCount < 1 || roundCount > 10) {
        setError("라운드 수는 1~10 사이로 입력해주세요.");
        return;
      }
    }

    const parsedLaneLimit = parseLaneLimit(laneLimit);

    if (parsedLaneLimit === null) {
      setError("라인 최대 인원은 1~99 사이의 정수로 입력해주세요.");
      return;
    }

    const parsedLaneLimits = Object.fromEntries(
      LANE_LIMIT_KEYS.map((key) => [key, parsedLaneLimit]),
    ) as Record<LaneLimitKey, number>;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/destruction-tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          preliminaryFormat,
          ...(shouldShowRoundCount
            ? { preliminaryRoundCount: Number(preliminaryRoundCount) }
            : {}),
          ...parsedLaneLimits,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "멸망전 생성 실패");
        return;
      }

      router.push(`/admin/progress/destruction/${data.id}`);
      router.refresh();
    } catch {
      setError("멸망전 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">멸망전 생성</h1>
          <p className="admin-page__description">
            생성 즉시 모집중으로 시작합니다. 팀장 지정, 포인트 경매, 팀 구성은 상세 페이지에서 진행합니다.
          </p>
        </div>
      </div>

      <div className="admin-form">
        <div className="admin-form__group">
          <label className="admin-form__label">멸망전명</label>
          <input aria-label="예: 2026 K-LOL 멸망전"
            className="admin-form__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 2026 K-LOL 멸망전"
          />
        </div>

        <div className="admin-event-form-grid">
          <div className="admin-form__group">
            <label className="admin-form__label">예선 방식</label>
            <select aria-label="예선 방식"
              className="admin-form__input"
              value={preliminaryFormat}
              onChange={(event) => setPreliminaryFormat(event.target.value as PreliminaryFormat)}
            >
              {PRELIMINARY_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {shouldShowRoundCount ? (
            <div className="admin-form__group">
              <label className="admin-form__label">라운드 수</label>
              <input aria-label="라운드 수"
                className="admin-form__input"
                type="number"
                min="1"
                max="10"
                value={preliminaryRoundCount}
                onChange={(event) => setPreliminaryRoundCount(event.target.value)}
              />
              <p className="admin-form__help">
                스위스/랜덤 방식에서만 사용됩니다. 전체 풀리그와 조별 풀리그는 자동으로 전체 대진을 생성합니다.
              </p>
            </div>
          ) : null}
        </div>


        <div className="admin-form__group">
          <label className="admin-form__label">라인별 최대 인원</label>
          <input aria-label="라인별 최대 인원"
            className="admin-form__input"
            type="number"
            min="1"
            max="99"
            value={laneLimit}
            onChange={(event) => setLaneLimit(event.target.value)}
          />
          <p className="admin-form__help">
            모든 라인에 같은 최대 인원이 적용됩니다. 기본값은 라인별 10명입니다. 참가 신청은 주 라인 기준으로 계산되며, 초과 인원은 늦게 신청한 순서대로 자동 보류됩니다.
          </p>
        </div>

        <div className="empty-box">
          {selectedFormat?.description ?? "예선 방식을 선택해주세요."} 본선 진출은 상위 4팀으로 고정됩니다.
          설명, 시작일, 종료일은 사용하지 않습니다.
        </div>

        {error ? <p className="notice-form__error">{error}</p> : null}

        <div className="admin-form__actions">
          <button
            type="button"
            className="chip-button"
            onClick={() => router.push("/admin/progress/destruction")}
          >
            목록으로
          </button>

          <button
            type="button"
            className="admin-page__create-button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "생성 중..." : "생성하기"}
          </button>
        </div>
      </div>
    </main>
  );
}
