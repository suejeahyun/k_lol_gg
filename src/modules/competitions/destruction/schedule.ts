import { requireCompetition } from "../core/error";

export const DESTRUCTION_SCHEDULE_LABELS = { recruitmentEndsAt: "모집 마감 예정", auctionStartsAt: "경매 시작 예정", preliminaryStartsAt: "예선 시작 예정", tournamentStartsAt: "본선 시작 예정" } as const;
export type DestructionSchedule = Readonly<Record<keyof typeof DESTRUCTION_SCHEDULE_LABELS, string | null>>;
export const EMPTY_DESTRUCTION_SCHEDULE: DestructionSchedule = { recruitmentEndsAt: null, auctionStartsAt: null, preliminaryStartsAt: null, tournamentStartsAt: null };

export function validateDestructionSchedule(value: unknown): DestructionSchedule {
  requireCompetition(value !== null && typeof value === "object" && !Array.isArray(value), "PRECONDITION_FAILED", "일정을 확인해 주세요.");
  const input = value as Record<string, unknown>;
  const keys = Object.keys(DESTRUCTION_SCHEDULE_LABELS) as (keyof DestructionSchedule)[];
  requireCompetition(Object.keys(input).length === keys.length && Object.keys(input).every((key) => keys.includes(key as keyof DestructionSchedule)), "PRECONDITION_FAILED", "일정 항목을 확인해 주세요.");
  let previous = -Infinity;
  const schedule = { ...EMPTY_DESTRUCTION_SCHEDULE };
  for (const key of keys) {
    const instant = input[key];
    if (instant === null) continue;
    requireCompetition(typeof instant === "string" && Number.isFinite(Date.parse(instant)) && new Date(instant).toISOString() === instant, "PRECONDITION_FAILED", "올바른 일정 날짜와 시간이 필요합니다.");
    const time = Date.parse(instant);
    requireCompetition(time >= previous, "PRECONDITION_FAILED", "모집 마감, 경매, 예선, 본선 순서대로 일정을 입력해 주세요.");
    previous = time; schedule[key] = instant;
  }
  return Object.freeze(schedule);
}
