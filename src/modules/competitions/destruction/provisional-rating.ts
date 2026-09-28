import { requireCompetition } from "../core/error";
import { ARAM_AUCTION_MINIMUM_BIDS, aramAuctionRating } from "./aram-rating";
import type { DestructionParticipant } from "./teams";

export const RATING_KEYS = ["aram", "solo", "inhouse", "champions", "challenges"] as const;
export type RatingKey = typeof RATING_KEYS[number];
export const RATING_LABELS: Record<RatingKey, string> = { aram: "일반 칼바람 성과", solo: "솔랭 실력", inhouse: "내전 통계", champions: "챔피언 대응력", challenges: "칼바람 도전과제" };
export type RatingPolicy = Readonly<{ version: "ABSOLUTE_V1" | "ABSOLUTE_V2"; weights: Readonly<Record<RatingKey, number>> }>;
export const DEFAULT_RATING_POLICY: RatingPolicy = { version: "ABSOLUTE_V2", weights: { aram: 20, solo: 40, inhouse: 20, champions: 15, challenges: 5 } };
export function ratingLabel(key: RatingKey, policy: RatingPolicy) { return key === "aram" && policy.version === "ABSOLUTE_V2" ? "해당 모드 승패" : RATING_LABELS[key]; }
export const ABSOLUTE_TIER_FLOORS = { S: 80, A: 65, B: 50, C: 35, D: 0 } as const;
export type RatingComponent = Readonly<{
  score: number | null;
  status: "READY" | "NO_DATA" | "ERROR";
  source: "RIOT" | "INHOUSE" | "ADMIN_VERIFIED" | "SELF_REPORTED";
  evidence: string;
  samples: number;
  observedAt: string;
}>;
export type RatingSnapshot = Readonly<{
  policy: RatingPolicy;
  components: Partial<Record<RatingKey, RatingComponent>>;
  collectedAt: string;
  linkId?: string;
  linkRevision?: number;
}>;
export type RatingCollectionState = Readonly<{ attempts: number; retryAt: string; error: string | null; complete: boolean }>;

export function validateRatingPolicy(value: unknown): RatingPolicy {
  const policy = value as RatingPolicy | null;
  requireCompetition((policy?.version === "ABSOLUTE_V1" || policy?.version === "ABSOLUTE_V2") && typeof policy.weights === "object" && policy.weights !== null &&
    Object.keys(policy).every((key) => ["version", "weights"].includes(key)) && Object.keys(policy.weights).length === RATING_KEYS.length &&
    RATING_KEYS.every((key) => Number.isSafeInteger(policy.weights[key]) && policy.weights[key] >= 0 && policy.weights[key] <= 100) &&
    RATING_KEYS.reduce((sum, key) => sum + policy.weights[key], 0) === 100,
  "PRECONDITION_FAILED", "평가 비중은 0~100의 정수이며 합계가 100이어야 합니다.");
  return { version: policy.version, weights: { ...policy.weights } };
}

export const boundedRatingScore = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
export function absoluteTier(score: number): keyof typeof ABSOLUTE_TIER_FLOORS {
  return score >= 80 ? "S" : score >= 65 ? "A" : score >= 50 ? "B" : score >= 35 ? "C" : "D";
}

/** Missing measurements stay unknown. Neither zero substitution nor weight redistribution is allowed. */
export function evaluateProvisionalRating(snapshot: RatingSnapshot) {
  const policy = validateRatingPolicy(snapshot.policy);
  let weighted = 0; let missingWeight = 0;
  const missing: RatingKey[] = [];
  for (const key of RATING_KEYS) {
    const component = snapshot.components[key];
    const weight = policy.weights[key];
    if (!weight) continue;
    if (!component || component.score === null || component.status !== "READY") { missing.push(key); missingWeight += weight; continue; }
    requireCompetition(Number.isFinite(component.score) && component.score >= 0 && component.score <= 100, "PRECONDITION_FAILED", "항목 점수는 0~100이어야 합니다.");
    weighted += Math.round(component.score * 100) * weight;
  }
  const minimum = Math.round(weighted / 100) / 100;
  const maximum = minimum + missingWeight;
  const score = missing.length ? null : minimum;
  // Do not assign even a seemingly safe tier until all weighted evidence is available.
  const tier = score === null ? null : absoluteTier(score);
  const minimumBid = tier === null ? null : ARAM_AUCTION_MINIMUM_BIDS[tier];
  return { score, minimum, maximum, tier, minimumBid, captainPoints: minimumBid === null ? null : 2_000 - minimumBid, missing, formulaVersion: policy.version };
}

/** Read the stored policy, so later defaults never reprice a frozen auction. */
export function participantAuctionRating(participant: DestructionParticipant) {
  if (participant.provisionalRating) {
    const result = evaluateProvisionalRating(participant.provisionalRating);
    if (result.tier === null || result.minimumBid === null || result.captainPoints === null) return null;
    const record = participant.provisionalRating.policy.version === "ABSOLUTE_V2" ? participant.selfReportedRecord : participant.aramRecord;
    return { ...result, tier: result.tier, minimumBid: result.minimumBid, captainPoints: result.captainPoints,
      games: record ? record.wins + record.losses : 0, wins: record?.wins ?? 0, losses: record?.losses ?? 0,
      provisional: RATING_KEYS.some((key) => participant.provisionalRating!.policy.weights[key] > 0 && (participant.provisionalRating!.components[key]?.samples ?? 0) < (key === "aram" || key === "inhouse" ? 20 : 1)) };
  }
  return participant.aramRecord ? { ...aramAuctionRating(participant.aramRecord), score: null, minimum: 0, maximum: 100, missing: [] as RatingKey[] } : null;
}

/** Fixed bands, independent of the tournament's entrants or ranked-ladder percentiles. */
export function soloRatingScore(tier: string, rank: string | null, lp: number): number | null {
  if (!Number.isSafeInteger(lp) || lp < 0) return null;
  const bands: Record<string, [number, number]> = { IRON: [5, 15], BRONZE: [15, 25], SILVER: [25, 35], GOLD: [35, 45], PLATINUM: [45, 55], EMERALD: [55, 65], DIAMOND: [65, 80], MASTER: [80, 90], GRANDMASTER: [90, 95], CHALLENGER: [95, 100] };
  const band = bands[tier]; if (!band) return null;
  const apex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier);
  const division = ["IV", "III", "II", "I"].indexOf(rank ?? "");
  if (!apex && division < 0) return null;
  const progress = apex ? Math.min(lp / 1_000, 1) : (division + Math.min(lp, 99) / 100) / 4;
  return boundedRatingScore(band[0] + (band[1] - band[0]) * progress);
}

export function championBreadthScore(entries: readonly { championPoints: number; lastPlayTime: number }[], now: number) {
  const recent = entries.filter((entry) => entry.lastPlayTime <= now && entry.lastPlayTime >= now - 180 * 86_400_000);
  const experienced = recent.filter((entry) => entry.championPoints >= 10_000).length;
  const points = recent.map((entry) => Math.min(entry.championPoints, 100_000)).sort((a, b) => b - a);
  const total = points.reduce((a, b) => a + b, 0);
  const concentration = total ? points.slice(0, 3).reduce((a, b) => a + b, 0) / total : 1;
  return { score: boundedRatingScore(70 * Math.min(experienced / 40, 1) + 30 * Math.min((1 - concentration) / 0.8, 1)), samples: recent.length, experienced };
}
