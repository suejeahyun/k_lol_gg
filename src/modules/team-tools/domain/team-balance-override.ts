import { TeamBalanceServiceError } from "./team-balance-draft";

export type TeamBalanceOverrideInput = Readonly<{ playerId: string; score: number; reason: string }>;
export function teamBalanceOverridePlayerId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "플레이어를 선택해 주세요.");
  }
  return value.toLowerCase();
}
export function parseTeamBalanceOverride(value: unknown): TeamBalanceOverrideInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TeamBalanceServiceError("INVALID_INPUT", "보정 입력이 올바르지 않습니다.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || Object.keys(row).some((key) => !["playerId", "score", "reason"].includes(key)) ||
    !Number.isSafeInteger(row.score) || Number(row.score) < -1_000 || Number(row.score) > 1_000 || typeof row.reason !== "string" ||
    row.reason.trim().length < 3 || row.reason.trim().length > 300 || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(row.reason)
  ) throw new TeamBalanceServiceError("INVALID_INPUT", "플레이어와 정수 보정값(-1000~1000), 3~300자 사유를 확인해 주세요.");
  return { playerId: teamBalanceOverridePlayerId(row.playerId), score: Number(row.score), reason: row.reason.trim() };
}
