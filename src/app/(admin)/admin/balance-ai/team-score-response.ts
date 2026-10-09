import { TEAM_BALANCE_POSITIONS } from "@/modules/team-tools/domain/team-balance";

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const score = (value: unknown) => finite(value) && Number.isInteger(value) && Math.abs(value) <= 1_000;
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value));
const nullable = (value: unknown, check: (value: unknown) => boolean) => value === null || check(value);

function page(value: unknown, checkItem: (value: unknown) => boolean): boolean {
  return record(value) && count(value.total) && count(value.page) && value.page > 0
    && count(value.pageSize) && value.pageSize > 0 && value.pageSize <= 50
    && Array.isArray(value.items) && value.items.length <= value.pageSize && value.items.every(checkItem);
}

function player(value: unknown): value is JsonRecord {
  return record(value) && text(value.playerId) && text(value.displayName) && text(value.riotId)
    && nullable(value.currentTier, text) && nullable(value.peakTier, text);
}

function history(value: unknown): boolean {
  return record(value) && count(value.id) && text(value.actorLabel) && nullable(value.beforeScore, score)
    && score(value.afterScore) && text(value.reason) && count(value.revision) && date(value.createdAt);
}

// Check the fields used by rendering and the shared score calculator before trusting JSON.
export function isUsableTeamScoreResponse(value: unknown, kind: "player" | "overview", playerId: string | null): boolean {
  if (!record(value) || value.kind !== kind || !nullable(value.ratingGeneration, count) || !text(value.formulaVersion)) return false;
  if (kind === "overview") {
    return value.scoreBasis === "ACTIVE_REGISTERED_PLAYERS_BASE_SCORE" && count(value.activePlayerCount)
      && page(value.configured, (item) => player(item) && score(item.score) && finite(item.baseScore)
        && text(item.reason) && count(item.revision) && date(item.updatedAt))
      && Array.isArray(value.tiers) && value.tiers.every((tier: unknown) => record(tier) && text(tier.tier)
        && text(tier.tierLabel) && count(tier.playerCount) && nullable(tier.averageBaseScore, finite) && nullable(tier.medianBaseScore, finite));
  }
  if (!player(value.player) || value.player.playerId !== playerId || value.previewPreference !== "MAIN"
    || !record(value.override) || value.override.playerId !== playerId || !score(value.override.score)
    || !count(value.override.revision) || !text(value.override.reason) || typeof value.override.configured !== "boolean"
    || !nullable(value.override.updatedAt, date) || !record(value.breakdown) || !finite(value.breakdown.baseScore)
    || value.breakdown.overrideScore !== value.override.score || !page(value.history, history)) return false;
  const positions = value.breakdown.positions;
  const overrideScore = value.override.score;
  return Array.isArray(positions) && positions.length === TEAM_BALANCE_POSITIONS.length
    && positions.every((position: unknown, index) => record(position) && position.position === TEAM_BALANCE_POSITIONS[index]
      && position.preference === "MAIN" && position.overrideScore === overrideScore
      && [position.baseScore, position.soloForm, position.positionSkill, position.mmrBonus, position.rolePenalty, position.effectiveScore].every(finite));
}
