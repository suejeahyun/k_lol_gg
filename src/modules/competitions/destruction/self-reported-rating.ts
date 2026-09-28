import { requireCompetition } from "../core/error";
import { DESTRUCTION_GAME_MODES } from "./aram-rating";
import { boundedRatingScore, DEFAULT_RATING_POLICY, evaluateProvisionalRating, RATING_KEYS, type RatingComponent, type RatingPolicy, type RatingSnapshot } from "./provisional-rating";
import type { DestructionAggregate } from "./state";
import type { DestructionParticipant } from "./teams";

export const MAX_REPORTED_GAMES = 1_000_000;
export type ReportedWinsLosses = Readonly<{ wins: number; losses: number }>;
export type SelfReportedModeRecord = ReportedWinsLosses & Readonly<{ mode: "ARAM" | "ARAM_MAYHEM"; submittedAt: string }>;

export function validateReportedWinsLosses(value: unknown): ReportedWinsLosses {
  const record = value as ReportedWinsLosses | null;
  requireCompetition(record !== null && typeof record === "object" && !Array.isArray(record) && Object.keys(record).length === 2 &&
    [record.wins, record.losses].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_REPORTED_GAMES) && record.wins + record.losses <= MAX_REPORTED_GAMES,
  "PRECONDITION_FAILED", "승수·패수는 0 이상의 정수이며 합계 1,000,000판 이내로 입력해 주세요.");
  return { wins: record.wins, losses: record.losses };
}

export function selfReportedRating(record: SelfReportedModeRecord | undefined, now: string): RatingComponent {
  if (!record) return { score: null, status: "NO_DATA", source: "SELF_REPORTED", samples: 0, observedAt: now, evidence: "신청자가 해당 모드의 누적 승수·패수를 입력해야 합니다." };
  const { wins, losses } = validateReportedWinsLosses({ wins: record.wins, losses: record.losses });
  const games = wins + losses;
  return { score: games ? boundedRatingScore(((wins + 10) / (games + 20) - 0.3) / 0.4 * 100) : null,
    status: games ? "READY" : "NO_DATA", source: "SELF_REPORTED", samples: games, observedAt: record.submittedAt,
    evidence: `${DESTRUCTION_GAME_MODES[record.mode]} 누적 ${wins}승 ${losses}패 · 본인 기재 · ${games ? `승률 ${(wins / games * 100).toFixed(2)}% · 20판 중립 보정${games < 20 ? " · 표본 20판 미만" : ""}` : "0판은 미확인"}` };
}

export function withSelfReportedRecord(participant: DestructionParticipant, policy: RatingPolicy, record: SelfReportedModeRecord | undefined, now: string): DestructionParticipant {
  const provisionalRating: RatingSnapshot = { ...(participant.provisionalRating ?? { components: {}, collectedAt: now }), policy, collectedAt: now,
    components: { ...participant.provisionalRating?.components, aram: selfReportedRating(record, now) } };
  return { ...participant, selfReportedRecord: record, aramRecord: undefined, aramCollection: undefined, provisionalRating,
    minimumBid: evaluateProvisionalRating(provisionalRating).minimumBid ?? undefined,
    ratingCollection: { attempts: 0, error: null, retryAt: now, complete: RATING_KEYS.every((key) => !policy.weights[key] || Boolean(provisionalRating.components[key])) } };
}

/** Upgrade only an unfrozen tournament. Stored auctions retain their original formula and prices. */
export function upgradeSelfReportedRatings(current: DestructionAggregate, now: string): DestructionAggregate {
  const mode = current.configuration.gameMode;
  if (!mode || mode === "CLASSIC" || current.teams.length || !["PLANNED", "RECRUITING", "TEAM_BUILDING"].includes(current.lifecycle.status)) return current;
  const policy: RatingPolicy = { ...(current.ratingPolicy ?? DEFAULT_RATING_POLICY), version: "ABSOLUTE_V2" };
  if (current.ratingPolicy?.version === policy.version) return current;
  return { ...current, ratingPolicy: policy, participants: current.participants.map((p) => {
    const record = current.applications.find((a) => a.id === p.id && a.playerId === p.playerId)?.selfReportedRecord;
    return withSelfReportedRecord(p, policy, record?.mode === mode ? record : undefined, now);
  }) };
}
