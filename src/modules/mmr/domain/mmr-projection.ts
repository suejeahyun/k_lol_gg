import type { TeamBalanceRatingProviderDto } from "@/modules/team-tools";

export const MMR_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
export const MMR_TEAMS = ["BLUE", "RED"] as const;

export type MmrPosition = (typeof MMR_POSITIONS)[number];
export type MmrTeam = (typeof MMR_TEAMS)[number];

export const MMR_FORMULA_VERSION = "V2_DETERMINISTIC_1";
export const MMR_INITIAL_SCORE_BP = 5_000;
export const MMR_MIN_SCORE_BP = 100;
export const MMR_MAX_SCORE_BP = 10_000;
export const MMR_CONFIDENCE_SAMPLE_TARGET = 30;

export type MmrMatchParticipantSource = Readonly<{
  playerId: string;
  team: MmrTeam;
  position: MmrPosition;
  kills: number;
  deaths: number;
  assists: number;
}>;

export type MmrMatchSource = Readonly<{
  id: string;
  orderKey: string;
  status: "DRAFT" | "PUBLISHED" | "VOIDED";
  games: readonly Readonly<{
    id: string;
    gameNumber: number;
    winnerTeam: MmrTeam;
    participants: readonly MmrMatchParticipantSource[];
  }>[];
}>;

export type MmrManualAdjustmentSource = Readonly<{
  id: string;
  orderKey: string;
  playerId: string;
  position: MmrPosition | null;
  deltaBp: number;
  reasonCode: string;
}>;

export type MmrPositionProfile = Readonly<{
  scoreBp: number;
  sampleSize: number;
}>;

export type MmrPlayerProfile = Readonly<{
  playerId: string;
  generation: number;
  overallScoreBp: number;
  confidenceBp: number;
  sampleSize: number;
  positions: Readonly<Record<MmrPosition, MmrPositionProfile>>;
}>;

export type MmrMatchResultEvent = Readonly<{
  sourceEventId: string;
  matchId: string;
  gameId: string;
  gameNumber: number;
  playerId: string;
  team: MmrTeam;
  position: MmrPosition;
  won: boolean;
  expectedWinRateBp: number;
  actualPerformanceBp: number;
  overallDeltaBp: number;
  positionDeltaBp: number;
  formulaVersion: typeof MMR_FORMULA_VERSION;
}>;

export type MmrAdjustmentEvent = Readonly<{
  sourceEventId: string;
  playerId: string;
  position: MmrPosition | null;
  requestedDeltaBp: number;
  appliedDeltaBp: number;
  reasonCode: string;
  formulaVersion: typeof MMR_FORMULA_VERSION;
}>;

export type MmrProjection = Readonly<{
  generation: number;
  sourceMatchCount: number;
  sourceGameCount: number;
  sourceAdjustmentCount: number;
  profiles: readonly MmrPlayerProfile[];
  matchEvents: readonly MmrMatchResultEvent[];
  adjustmentEvents: readonly MmrAdjustmentEvent[];
}>;

export type PublicMmrProfileDto = Readonly<{
  playerId: string;
  overallScore: number;
  confidence: number;
  sampleSize: number;
  positions: Readonly<Record<MmrPosition, Readonly<{ score: number; sampleSize: number }>>>;
}>;

type MutablePositionProfile = { scoreBp: number; sampleSize: number };
type MutableProfile = {
  playerId: string;
  overallScoreBp: number;
  sampleSize: number;
  positions: Record<MmrPosition, MutablePositionProfile>;
};

type OrderedSource =
  | Readonly<{ kind: "MATCH"; id: string; orderKey: string; match: MmrMatchSource }>
  | Readonly<{
      kind: "ADJUSTMENT";
      id: string;
      orderKey: string;
      adjustment: MmrManualAdjustmentSource;
    }>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function requireIdentifier(value: string, code: string): void {
  if (!value || value !== value.trim() || value.length > 200) throw new Error(code);
}

function requireCount(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) throw new Error(code);
}

function isPosition(value: unknown): value is MmrPosition {
  return MMR_POSITIONS.includes(value as MmrPosition);
}

function isTeam(value: unknown): value is MmrTeam {
  return MMR_TEAMS.includes(value as MmrTeam);
}

function createProfile(playerId: string): MutableProfile {
  return {
    playerId,
    overallScoreBp: MMR_INITIAL_SCORE_BP,
    sampleSize: 0,
    positions: Object.fromEntries(
      MMR_POSITIONS.map((position) => [position, { scoreBp: MMR_INITIAL_SCORE_BP, sampleSize: 0 }]),
    ) as Record<MmrPosition, MutablePositionProfile>,
  };
}

function getProfile(profiles: Map<string, MutableProfile>, playerId: string): MutableProfile {
  const current = profiles.get(playerId);
  if (current) return current;
  const created = createProfile(playerId);
  profiles.set(playerId, created);
  return created;
}

function confidenceBp(sampleSize: number): number {
  return Math.min(10_000, Math.round((sampleSize * 10_000) / MMR_CONFIDENCE_SAMPLE_TARGET));
}

function effectivePlayerScore(profile: MutableProfile, position: MmrPosition): number {
  return profile.overallScoreBp + Math.round(profile.positions[position].scoreBp / 4);
}

function expectedWinRateBp(teamScore: number, opponentScore: number): number {
  const probability = 1 / (1 + 10 ** ((opponentScore - teamScore) / 4_000));
  return clamp(Math.round(probability * 10_000), 1, 9_999);
}

function performanceScoreBp(input: MmrMatchParticipantSource, won: boolean): number {
  const kda = (input.kills + input.assists) / Math.max(1, input.deaths);
  const kdaBonus = clamp(Math.round((kda - 2.2) * 220), -400, 500);
  const deathBonus = input.deaths <= 2
    ? 200
    : input.deaths <= 4
      ? 100
      : input.deaths <= 6
        ? 0
        : -Math.min(400, (input.deaths - 6) * 100);
  const supportBonus = input.position === "SUP" ? clamp(Math.round(input.assists * 25), 0, 300) : 0;
  const weightBp = input.position === "JGL" || input.position === "MID"
    ? 11_000
    : input.position === "ADC"
      ? 10_500
      : input.position === "SUP"
        ? 9_500
        : 10_000;
  return Math.round(((5_000 + (won ? 800 : -800) + kdaBonus + deathBonus + supportBonus) * weightBp) / 10_000);
}

function validateGame(matchId: string, game: MmrMatchSource["games"][number]): void {
  requireIdentifier(game.id, "INVALID_GAME_ID");
  if (!Number.isSafeInteger(game.gameNumber) || game.gameNumber <= 0) {
    throw new Error("INVALID_GAME_NUMBER");
  }
  if (!isTeam(game.winnerTeam)) throw new Error("INVALID_WINNER_TEAM");
  if (game.participants.length !== 10) throw new Error("INVALID_GAME_PARTICIPANT_COUNT");

  const players = new Set<string>();
  const rosterKeys = new Set<string>();
  const teamCounts: Record<MmrTeam, number> = { BLUE: 0, RED: 0 };
  for (const participant of game.participants) {
    requireIdentifier(participant.playerId, "INVALID_PLAYER_ID");
    if (!isTeam(participant.team)) throw new Error("INVALID_PARTICIPANT_TEAM");
    if (!isPosition(participant.position)) throw new Error("INVALID_PARTICIPANT_POSITION");
    requireCount(participant.kills, "INVALID_KILLS");
    requireCount(participant.deaths, "INVALID_DEATHS");
    requireCount(participant.assists, "INVALID_ASSISTS");
    if (players.has(participant.playerId)) throw new Error("DUPLICATE_GAME_PLAYER");
    players.add(participant.playerId);
    const rosterKey = `${participant.team}:${participant.position}`;
    if (rosterKeys.has(rosterKey)) throw new Error("DUPLICATE_TEAM_POSITION");
    rosterKeys.add(rosterKey);
    teamCounts[participant.team] += 1;
  }
  if (teamCounts.BLUE !== 5 || teamCounts.RED !== 5) {
    throw new Error(`INVALID_GAME_TEAMS:${matchId}`);
  }
}

function applyMatch(
  sourceEventId: string,
  match: MmrMatchSource,
  profiles: Map<string, MutableProfile>,
  resultEvents: MmrMatchResultEvent[],
): number {
  const gameIds = new Set<string>();
  const gameNumbers = new Set<number>();
  const pendingByPlayer = new Map<string, Array<Readonly<{
    position: MmrPosition;
    overallDeltaBp: number;
    positionDeltaBp: number;
  }>>>();
  const orderedGames = [...match.games].sort(
    (left, right) => left.gameNumber - right.gameNumber || compareText(left.id, right.id),
  );

  for (const game of orderedGames) {
    validateGame(match.id, game);
    if (gameIds.has(game.id)) throw new Error("DUPLICATE_GAME_ID");
    if (gameNumbers.has(game.gameNumber)) throw new Error("DUPLICATE_GAME_NUMBER");
    gameIds.add(game.id);
    gameNumbers.add(game.gameNumber);

    const teamScores: Record<MmrTeam, number> = { BLUE: 0, RED: 0 };
    for (const participant of game.participants) {
      const profile = getProfile(profiles, participant.playerId);
      teamScores[participant.team] += effectivePlayerScore(profile, participant.position);
    }
    const expected: Record<MmrTeam, number> = {
      BLUE: expectedWinRateBp(teamScores.BLUE, teamScores.RED),
      RED: expectedWinRateBp(teamScores.RED, teamScores.BLUE),
    };

    for (const participant of [...game.participants].sort((left, right) => compareText(left.playerId, right.playerId))) {
      const won = participant.team === game.winnerTeam;
      const actualPerformanceBp = performanceScoreBp(participant, won);
      const surpriseBp = won ? 10_000 - expected[participant.team] : -expected[participant.team];
      const overallDeltaBp = clamp(
        Math.round((surpriseBp * 800) / 10_000 + (actualPerformanceBp - 5_000) / 8),
        -600,
        600,
      );
      const positionDeltaBp = clamp(Math.round((overallDeltaBp * 115) / 100), -700, 700);
      const pending = pendingByPlayer.get(participant.playerId) ?? [];
      pending.push({ position: participant.position, overallDeltaBp, positionDeltaBp });
      pendingByPlayer.set(participant.playerId, pending);
      resultEvents.push({
        sourceEventId,
        matchId: match.id,
        gameId: game.id,
        gameNumber: game.gameNumber,
        playerId: participant.playerId,
        team: participant.team,
        position: participant.position,
        won,
        expectedWinRateBp: expected[participant.team],
        actualPerformanceBp,
        overallDeltaBp,
        positionDeltaBp,
        formulaVersion: MMR_FORMULA_VERSION,
      });
    }
  }

  for (const [playerId, deltas] of [...pendingByPlayer].sort(([left], [right]) => compareText(left, right))) {
    const profile = getProfile(profiles, playerId);
    profile.overallScoreBp = clamp(
      profile.overallScoreBp + Math.round(deltas.reduce((sum, row) => sum + row.overallDeltaBp, 0) / deltas.length),
      MMR_MIN_SCORE_BP,
      MMR_MAX_SCORE_BP,
    );
    profile.sampleSize += deltas.length;
    for (const position of MMR_POSITIONS) {
      const positionDeltas = deltas.filter((row) => row.position === position);
      if (positionDeltas.length === 0) continue;
      const positionProfile = profile.positions[position];
      positionProfile.scoreBp = clamp(
        positionProfile.scoreBp + Math.round(
          positionDeltas.reduce((sum, row) => sum + row.positionDeltaBp, 0) / positionDeltas.length,
        ),
        MMR_MIN_SCORE_BP,
        MMR_MAX_SCORE_BP,
      );
      positionProfile.sampleSize += positionDeltas.length;
    }
  }
  return orderedGames.length;
}

function applyAdjustment(
  adjustment: MmrManualAdjustmentSource,
  profiles: Map<string, MutableProfile>,
): MmrAdjustmentEvent {
  requireIdentifier(adjustment.playerId, "INVALID_PLAYER_ID");
  requireIdentifier(adjustment.reasonCode, "INVALID_ADJUSTMENT_REASON");
  if (adjustment.position !== null && !isPosition(adjustment.position)) {
    throw new Error("INVALID_ADJUSTMENT_POSITION");
  }
  if (!Number.isSafeInteger(adjustment.deltaBp) || adjustment.deltaBp < -1_000 || adjustment.deltaBp > 1_000) {
    throw new Error("INVALID_ADJUSTMENT_DELTA");
  }
  const profile = getProfile(profiles, adjustment.playerId);
  const target = adjustment.position === null
    ? profile.overallScoreBp
    : profile.positions[adjustment.position].scoreBp;
  const next = clamp(target + adjustment.deltaBp, MMR_MIN_SCORE_BP, MMR_MAX_SCORE_BP);
  if (adjustment.position === null) profile.overallScoreBp = next;
  else profile.positions[adjustment.position].scoreBp = next;
  return {
    sourceEventId: adjustment.id,
    playerId: adjustment.playerId,
    position: adjustment.position,
    requestedDeltaBp: adjustment.deltaBp,
    appliedDeltaBp: next - target,
    reasonCode: adjustment.reasonCode,
    formulaVersion: MMR_FORMULA_VERSION,
  };
}

/**
 * Replays the complete immutable source ledger. It never mutates a previous profile,
 * so retries, corrections and out-of-order delivery converge on the same generation.
 */
export function rebuildMmrProjection(input: Readonly<{
  generation: number;
  matches: readonly MmrMatchSource[];
  manualAdjustments?: readonly MmrManualAdjustmentSource[];
}>): MmrProjection {
  if (!Number.isSafeInteger(input.generation) || input.generation <= 0) {
    throw new Error("INVALID_MMR_GENERATION");
  }
  const sources: OrderedSource[] = [];
  const sourceIds = new Set<string>();
  const publishedMatches = input.matches.filter((match) => match.status === "PUBLISHED");
  const globalGameIds = new Set<string>();
  for (const match of publishedMatches) {
    requireIdentifier(match.id, "INVALID_MATCH_ID");
    requireIdentifier(match.orderKey, "INVALID_MATCH_ORDER_KEY");
    if (match.games.length === 0) throw new Error("PUBLISHED_MATCH_WITHOUT_GAMES");
    if (sourceIds.has(match.id)) throw new Error("DUPLICATE_MMR_SOURCE_ID");
    sourceIds.add(match.id);
    for (const game of match.games) {
      requireIdentifier(game.id, "INVALID_GAME_ID");
      if (globalGameIds.has(game.id)) throw new Error("DUPLICATE_GAME_ID");
      globalGameIds.add(game.id);
    }
    sources.push({ kind: "MATCH", id: match.id, orderKey: match.orderKey, match });
  }
  for (const adjustment of input.manualAdjustments ?? []) {
    requireIdentifier(adjustment.id, "INVALID_ADJUSTMENT_ID");
    requireIdentifier(adjustment.orderKey, "INVALID_ADJUSTMENT_ORDER_KEY");
    if (sourceIds.has(adjustment.id)) throw new Error("DUPLICATE_MMR_SOURCE_ID");
    sourceIds.add(adjustment.id);
    sources.push({
      kind: "ADJUSTMENT",
      id: adjustment.id,
      orderKey: adjustment.orderKey,
      adjustment,
    });
  }
  sources.sort((left, right) =>
    compareText(left.orderKey, right.orderKey) ||
    compareText(left.kind, right.kind) ||
    compareText(left.id, right.id),
  );

  const profiles = new Map<string, MutableProfile>();
  const matchEvents: MmrMatchResultEvent[] = [];
  const adjustmentEvents: MmrAdjustmentEvent[] = [];
  let sourceGameCount = 0;
  for (const source of sources) {
    if (source.kind === "MATCH") {
      sourceGameCount += applyMatch(source.id, source.match, profiles, matchEvents);
    } else {
      adjustmentEvents.push(applyAdjustment(source.adjustment, profiles));
    }
  }

  return {
    generation: input.generation,
    sourceMatchCount: publishedMatches.length,
    sourceGameCount,
    sourceAdjustmentCount: adjustmentEvents.length,
    profiles: [...profiles.values()]
      .sort((left, right) => compareText(left.playerId, right.playerId))
      .map((profile) => ({
        playerId: profile.playerId,
        generation: input.generation,
        overallScoreBp: profile.overallScoreBp,
        confidenceBp: confidenceBp(profile.sampleSize),
        sampleSize: profile.sampleSize,
        positions: Object.fromEntries(MMR_POSITIONS.map((position) => [position, {
          scoreBp: profile.positions[position].scoreBp,
          sampleSize: profile.positions[position].sampleSize,
        }])) as Record<MmrPosition, MmrPositionProfile>,
      })),
    matchEvents,
    adjustmentEvents,
  };
}

function scoreFromBp(value: number): number {
  return Math.round(value) / 100;
}

/** Explicit allowlist: adjustment reasons and per-match internal inference never leak. */
export function toPublicMmrProfileDto(profile: MmrPlayerProfile): PublicMmrProfileDto {
  return {
    playerId: profile.playerId,
    overallScore: scoreFromBp(profile.overallScoreBp),
    confidence: profile.confidenceBp / 10_000,
    sampleSize: profile.sampleSize,
    positions: Object.fromEntries(MMR_POSITIONS.map((position) => [position, {
      score: scoreFromBp(profile.positions[position].scoreBp),
      sampleSize: profile.positions[position].sampleSize,
    }])) as PublicMmrProfileDto["positions"],
  };
}

export function toTeamBalanceMmrProviderDto(profile: MmrPlayerProfile): TeamBalanceRatingProviderDto {
  return {
    overall: scoreFromBp(profile.overallScoreBp),
    confidence: profile.confidenceBp / 10_000,
    sampleSize: profile.sampleSize,
    positions: Object.fromEntries(MMR_POSITIONS.map((position) => {
      const positionProfile = profile.positions[position];
      return [position, {
        score: scoreFromBp(positionProfile.scoreBp),
        confidence: confidenceBp(positionProfile.sampleSize) / 10_000,
        sampleSize: positionProfile.sampleSize,
      }];
    })) as TeamBalanceRatingProviderDto["positions"],
  };
}
