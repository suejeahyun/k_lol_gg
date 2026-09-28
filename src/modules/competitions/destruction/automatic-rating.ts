import { AramSyncError, type AramCollection, type AramRecord } from "./aram-rating";
import { boundedRatingScore, evaluateProvisionalRating, RATING_KEYS, type RatingComponent, type RatingKey, type RatingPolicy, type RatingSnapshot } from "./provisional-rating";
import type { DestructionParticipant } from "./teams";
import { selfReportedRating } from "./self-reported-rating";

export interface AutomaticRatingSources {
  component(key: Exclude<RatingKey, "aram">): Promise<RatingComponent>;
  aram(previous?: AramCollection): Promise<{ collection: AramCollection; record?: AramRecord }>;
}

/** One bounded, resumable step. A successful lookup with no data is not an API failure or zero score. */
export async function advanceAutomaticRating(participant: DestructionParticipant, policy: RatingPolicy, now: string, sources: AutomaticRatingSources): Promise<DestructionParticipant> {
  const snapshot: RatingSnapshot = { ...(participant.provisionalRating ?? { components: {}, collectedAt: now }), policy };
  const key = (["solo", "inhouse", "champions", "challenges", "aram"] as const).find((key) => policy.weights[key] > 0 && !snapshot.components[key]);
  if (!key) return { ...participant, provisionalRating: snapshot, minimumBid: evaluateProvisionalRating(snapshot).minimumBid ?? undefined, ratingCollection: { complete: true, attempts: 0, retryAt: now, error: null } };
  let next = participant;
  let component: RatingComponent | undefined;
  try {
    if (key === "aram" && policy.version !== "ABSOLUTE_V1") component = selfReportedRating(participant.selfReportedRecord, now, policy.version);
    else if (key === "aram") {
      const result = await sources.aram(participant.aramCollection);
      next = { ...participant, aramCollection: result.collection };
      if (result.record) {
        next = { ...next, aramRecord: result.record };
        const games = result.record.wins + result.record.losses;
        const winScore = boundedRatingScore((((result.record.wins + 10) / (games + 20)) - 0.3) / 0.4 * 100);
        const impact = result.record.performanceScore;
        component = { score: impact === undefined ? null : boundedRatingScore(0.4 * winScore + 0.6 * ((impact * games + 50 * 20) / (games + 20))), status: impact === undefined ? "NO_DATA" : "READY", source: "RIOT", samples: games, observedAt: now,
          evidence: `${result.record.evidence} · 승패 40%·전투 기여 60% · 20판 중립 보정${impact === undefined ? " · 상세 기여 통계 없음" : ""}` };
      }
    } else component = await sources.component(key);
  } catch (error) {
    if (!(error instanceof AramSyncError)) throw error;
    const attempts = (participant.ratingCollection?.attempts ?? 0) + 1;
    if (error.code === "RATE_LIMITED" || (attempts < 3 && ["UNAVAILABLE", "INVALID_RESPONSE"].includes(error.code))) {
      return { ...participant, provisionalRating: snapshot, ratingCollection: { complete: false, attempts, error: error.code, retryAt: new Date(Date.parse(now) + Math.max(error.retryAfterSeconds, 60) * 1000).toISOString() } };
    }
    component = { score: null, status: error.code === "NO_MATCHES" || error.code === "NOT_CONNECTED" ? "NO_DATA" : "ERROR", source: "RIOT", samples: 0, observedAt: now, evidence: key === "aram" && error.code === "NO_MATCHES" ? "최근 90→180→365일 단계 조회 · 제공된 최근 최대 100판 내 유효 일반 칼바람 기록 없음" : error.code };
  }
  const provisionalRating: RatingSnapshot = { ...snapshot, collectedAt: now, components: { ...snapshot.components, ...(component ? { [key]: component } : {}) } };
  const complete = RATING_KEYS.every((key) => !policy.weights[key] || Boolean(provisionalRating.components[key]));
  return { ...next, provisionalRating, minimumBid: evaluateProvisionalRating(provisionalRating).minimumBid ?? undefined,
    ratingCollection: { complete, attempts: 0, error: null, retryAt: now } };
}
