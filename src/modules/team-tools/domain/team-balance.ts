export const TEAM_BALANCE_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
export const TEAM_BALANCE_TEAMS = ["BLUE", "RED"] as const;
export const TEAM_BALANCE_PREFERENCES = ["MAIN", "SUB", "AUTO"] as const;
export const TEAM_BALANCE_V1_FORMULA_VERSION = "V1_BLUEBLACK_AI_GLOBAL_2026_09_11";

export type TeamBalancePosition = (typeof TEAM_BALANCE_POSITIONS)[number];
export type TeamBalanceTeam = (typeof TEAM_BALANCE_TEAMS)[number];
export type TeamBalancePreference = (typeof TEAM_BALANCE_PREFERENCES)[number];

export const TEAM_BALANCE_PLAYER_COUNT = 10;
export const TEAM_BALANCE_TEAM_SIZE = 5;
export const DEFAULT_TEAM_BALANCE_SCORE = 50;
export const DEFAULT_TEAM_BALANCE_CONFIDENCE = 0;

/** Compatibility export. The active formula is identified by TEAM_BALANCE_V1_FORMULA_VERSION. */
export const TEAM_BALANCE_SCORING_WEIGHTS = Object.freeze({
  teamStrengthDifference: 1.2,
  positionStrengthDifference: 0.7,
  preference: 1,
  uncertainty: 0.4,
} as const);

export const TEAM_BALANCE_PREFERENCE_PENALTIES = Object.freeze({
  MAIN: 0,
  SUB: 5,
  AUTO: 10,
} as const satisfies Readonly<Record<TeamBalancePreference, number>>);

export type TeamBalancePositionRatingDto = Readonly<{
  score: number | null;
  confidence: number | null;
  sampleSize: number | null;
}>;

export type TeamBalanceV1RecentSoloDto = Readonly<{
  games: number;
  wins: number;
  kda: number | null;
  mainPosition: TeamBalancePosition | null;
  subPosition: TeamBalancePosition | null;
  positionConfidence: number;
  averageDamage: number | null;
  averageVisionScore: number | null;
}>;

export type TeamBalanceV1MissingSource = "RECENT_SOLO" | "BALANCE_OVERRIDE";

export type TeamBalanceV1MmrInputs = Readonly<{
  overall: number;
  confidence: number;
  positions: Readonly<Partial<Record<TeamBalancePosition, number>>>;
}>;

export type TeamBalanceV1RatingInputs = Readonly<{
  legacyPlayerId: number | null;
  currentTier: string | null;
  peakTier: string | null;
  season: Readonly<{ totalGames: number; wins: number; mvpCount: number }> | null;
  internalGames: number;
  internalPositionGames: Readonly<Partial<Record<TeamBalancePosition, number>>>;
  recentSolo: TeamBalanceV1RecentSoloDto | null;
  balanceOverrideScore: number;
  mmr: TeamBalanceV1MmrInputs;
  missingSources: readonly TeamBalanceV1MissingSource[];
}>;

/** Nullable read model supplied by the rating provider boundary. */
export type TeamBalanceRatingProviderDto = Readonly<{
  overall: number | null;
  confidence: number | null;
  sampleSize: number | null;
  positions: Readonly<Partial<Record<TeamBalancePosition, TeamBalancePositionRatingDto | null>>> | null;
  v1?: TeamBalanceV1RatingInputs | null;
}>;

export type TeamBalanceEligibility = Readonly<{
  position: TeamBalancePosition;
  preference: TeamBalancePreference;
}>;

export type TeamBalancePlayer = Readonly<{
  playerId: string;
  eligiblePositions: readonly TeamBalanceEligibility[];
  rating: TeamBalanceRatingProviderDto | null;
}>;

export type TeamBalanceLayoutEntry = Readonly<{
  playerId: string;
  team: TeamBalanceTeam;
  position: TeamBalancePosition;
}>;

export type TeamBalanceRatingSource = "POSITION" | "OVERALL" | "DEFAULT" | "V1";

export type EvaluatedTeamBalanceAssignment = TeamBalanceLayoutEntry & Readonly<{
  preference: TeamBalancePreference;
  rating: Readonly<{
    source: TeamBalanceRatingSource;
    rawScore: number;
    effectiveScore: number;
    confidence: number;
    sampleSize: number | null;
  }>;
}>;

export type TeamBalancePositionBreakdown = Readonly<{
  position: TeamBalancePosition;
  blueScore: number;
  redScore: number;
  difference: number;
}>;

export type TeamBalanceV1ScoreBreakdown = Readonly<{
  formulaVersion: typeof TEAM_BALANCE_V1_FORMULA_VERSION;
  qualityScore: number;
  recommendationScore: number;
  predictedRedWinRate: number;
  predictedBlueWinRate: number;
  weightedLineDifference: number;
  maximumLineDifference: number;
  frontSideDifference: number;
  midJungleDifference: number;
  bottomDifference: number;
  highTierPriorityPenalty: number;
  remainingMainPriorityPenalty: number;
  carryDistributionPenalty: number;
  stompPenalty: number;
  warnings: readonly string[];
  missingSources: readonly TeamBalanceV1MissingSource[];
}>;

export type TeamBalanceScoreBreakdown = Readonly<{
  teamStrength: Readonly<{
    blueTotal: number;
    redTotal: number;
    difference: number;
    weightedPenalty: number;
  }>;
  positions: readonly TeamBalancePositionBreakdown[];
  positionDifferenceTotal: number;
  positionWeightedPenalty: number;
  preference: Readonly<{
    mainCount: number;
    subCount: number;
    autoCount: number;
    rawPenalty: number;
    weightedPenalty: number;
  }>;
  uncertainty: Readonly<{
    averageConfidence: number;
    noSampleCount: number;
    rawPenalty: number;
    weightedPenalty: number;
  }>;
  totalPenalty: number;
  v1?: TeamBalanceV1ScoreBreakdown;
}>;

export type EvaluatedTeamBalanceLayout = Readonly<{
  signature: string;
  assignments: readonly EvaluatedTeamBalanceAssignment[];
  score: TeamBalanceScoreBreakdown;
}>;

export type TeamBalanceCandidate = EvaluatedTeamBalanceLayout & Readonly<{ rank: number }>;

export type TeamBalanceCalculation = Readonly<{
  candidates: readonly TeamBalanceCandidate[];
  search: Readonly<{
    symmetryAnchorPlayerId: string;
    teamCombinationCount: number;
    feasibleLayoutCount: number;
  }>;
}>;

export type TeamBalanceDomainErrorCode =
  | "PARTICIPANT_COUNT"
  | "DUPLICATE_PLAYER_ID"
  | "INVALID_PLAYER_ID"
  | "MISSING_ELIGIBLE_POSITION"
  | "DUPLICATE_ELIGIBLE_POSITION"
  | "INVALID_POSITION"
  | "INVALID_PREFERENCE"
  | "INVALID_SCORE"
  | "INVALID_LAYOUT"
  | "NO_FEASIBLE_LAYOUT";

export class TeamBalanceDomainError extends Error {
  constructor(readonly code: TeamBalanceDomainErrorCode, readonly subject?: string) {
    super(subject ? `${code}: ${subject}` : code);
    this.name = "TeamBalanceDomainError";
  }
}

type NormalizedRating = Readonly<{
  overall: number;
  overallSource: "OVERALL" | "DEFAULT";
  confidence: number;
  sampleSize: number | null;
  positions: Readonly<Partial<Record<TeamBalancePosition, TeamBalancePositionRatingDto | null>>>;
  v1: TeamBalanceV1RatingInputs | null;
}>;

type NormalizedPlayer = Readonly<{
  playerId: string;
  eligiblePositions: ReadonlyMap<TeamBalancePosition, TeamBalancePreference>;
  rating: NormalizedRating;
  finalBaseScore: number;
  sTierBonus: number;
  highTier: boolean;
}>;

type InternalAssignment = EvaluatedTeamBalanceAssignment & Readonly<{
  finalBaseScore: number;
  sTierBonus: number;
  highTier: boolean;
  internalGames: number;
  internalPositionGames: number;
  recentSoloGames: number;
  missingSources: readonly TeamBalanceV1MissingSource[];
  legacyPlayerId: number | null;
}>;

type PreparedTeam = Readonly<{
  assignments: readonly InternalAssignment[];
  total: number;
  mainCount: number;
  subCount: number;
  autoCount: number;
  priorityMainCount: number;
  prioritySubCount: number;
  priorityAutoCount: number;
}>;

type CandidateMetrics = Readonly<{
  blue: PreparedTeam;
  red: PreparedTeam;
  assignments: readonly InternalAssignment[];
  signature: string;
  diff: number;
  lineDiffTotal: number;
  maxLineDiff: number;
  topPlayerDiff: number;
  topRankStackPenalty: number;
  sTierStackPenalty: number;
  weightedLineDiff: number;
  frontSideDiff: number;
  midJglDiff: number;
  bottomDiff: number;
  autoLinePenalty: number;
  mainImbalancePenalty: number;
  dataReliabilityPenalty: number;
  stompPenalty: number;
  highTierPriorityPenalty: number;
  remainingMainPriorityPenalty: number;
  balanceCost: number;
  qualityScore: number;
  recommendationScore: number;
  warningMessages: readonly string[];
}>;

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

function isPosition(value: unknown): value is TeamBalancePosition {
  return TEAM_BALANCE_POSITIONS.includes(value as TeamBalancePosition);
}

function isTeam(value: unknown): value is TeamBalanceTeam {
  return TEAM_BALANCE_TEAMS.includes(value as TeamBalanceTeam);
}

function isPreference(value: unknown): value is TeamBalancePreference {
  return TEAM_BALANCE_PREFERENCES.includes(value as TeamBalancePreference);
}

function validateNumber(value: number | null, subject: string, min: number, max: number) {
  if (value !== null && (!Number.isFinite(value) || value < min || value > max)) {
    throw new TeamBalanceDomainError("INVALID_SCORE", subject);
  }
}

function validateCount(value: number | null, subject: string) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TeamBalanceDomainError("INVALID_SCORE", subject);
  }
}

function normalizeRating(playerId: string, value: TeamBalanceRatingProviderDto | null): NormalizedRating {
  if (value === null) return { overall: 50, overallSource: "DEFAULT", confidence: 0, sampleSize: null, positions: {}, v1: null };
  validateNumber(value.overall, `${playerId}.overall`, 0, 100);
  validateNumber(value.confidence, `${playerId}.confidence`, 0, 1);
  validateCount(value.sampleSize, `${playerId}.sampleSize`);
  const positions = value.positions ?? {};
  for (const [position, positionRating] of Object.entries(positions)) {
    if (!isPosition(position)) throw new TeamBalanceDomainError("INVALID_POSITION", `${playerId}.${position}`);
    if (!positionRating) continue;
    validateNumber(positionRating.score, `${playerId}.${position}.score`, 0, 100);
    validateNumber(positionRating.confidence, `${playerId}.${position}.confidence`, 0, 1);
    validateCount(positionRating.sampleSize, `${playerId}.${position}.sampleSize`);
  }
  if (value.v1) {
    validateCount(value.v1.legacyPlayerId, `${playerId}.v1.legacyPlayerId`);
    validateCount(value.v1.internalGames, `${playerId}.v1.internalGames`);
    validateNumber(value.v1.balanceOverrideScore, `${playerId}.v1.balanceOverrideScore`, -1_000, 1_000);
    validateNumber(value.v1.mmr.overall, `${playerId}.v1.mmr.overall`, 0, 100);
    validateNumber(value.v1.mmr.confidence, `${playerId}.v1.mmr.confidence`, 0, 1);
    for (const [position, score] of Object.entries(value.v1.mmr.positions)) {
      if (!isPosition(position)) throw new TeamBalanceDomainError("INVALID_POSITION", `${playerId}.v1.mmr.${position}`);
      validateNumber(score ?? null, `${playerId}.v1.mmr.${position}`, 0, 100);
    }
    for (const [position, count] of Object.entries(value.v1.internalPositionGames)) {
      if (!isPosition(position)) throw new TeamBalanceDomainError("INVALID_POSITION", `${playerId}.v1.${position}`);
      validateCount(count ?? null, `${playerId}.v1.${position}`);
    }
    if (value.v1.season) {
      validateCount(value.v1.season.totalGames, `${playerId}.v1.season.totalGames`);
      validateCount(value.v1.season.wins, `${playerId}.v1.season.wins`);
      validateCount(value.v1.season.mvpCount, `${playerId}.v1.season.mvpCount`);
    }
    if (value.v1.recentSolo) {
      validateCount(value.v1.recentSolo.games, `${playerId}.v1.recentSolo.games`);
      validateCount(value.v1.recentSolo.wins, `${playerId}.v1.recentSolo.wins`);
      validateNumber(value.v1.recentSolo.positionConfidence, `${playerId}.v1.recentSolo.positionConfidence`, 0, 1);
    }
  }
  return {
    overall: value.overall ?? 50,
    overallSource: value.overall === null ? "DEFAULT" : "OVERALL",
    confidence: value.confidence ?? 0,
    sampleSize: value.sampleSize,
    positions,
    v1: value.v1 ?? null,
  };
}

function extractLp(raw: string) {
  const match = raw.replace(/\s/gu, "").match(/(\d+)\s*(p|P|lp|LP|점)/u);
  return match ? Number(match[1]) : null;
}

function extractDivision(raw: string) {
  const compact = raw.replace(/\s/gu, "").toLowerCase();
  for (const pattern of [
    /(?:다이아몬드|다이아|다|diamond|d)([1-4])$/u,
    /(?:에메랄드|에메|에|emerald|e)([1-4])$/u,
    /(?:플래티넘|플레티넘|플레|플|platinum|p)([1-4])$/u,
    /(?:골드|골|gold|g)([1-4])$/u,
    /(?:실버|실|silver|s)([1-4])$/u,
    /(?:브론즈|브|bronze|b)([1-4])$/u,
    /(?:아이언|아|iron|i)([1-4])$/u,
  ]) {
    const match = compact.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function tierScore(raw: string | null) {
  const value = raw?.trim() ?? "";
  const compact = value.replace(/\s/gu, "").toLowerCase();
  const matches = (aliases: readonly string[]) => aliases.some((alias) => compact === alias || compact.startsWith(alias));
  const division = extractDivision(value);
  const divisionBonus = division === 1 ? 6 : division === 2 ? 4 : division === 3 ? 2 : 0;
  const lpBonus = (unit: number, max: number) => Math.min(max, Math.floor((extractLp(value) ?? 0) / unit));
  if (!compact) return null;
  if (matches(["챌린저", "챌", "challenger", "ch", "c"])) return 118 + lpBonus(200, 7);
  if (matches(["그랜드마스터", "그마", "grandmaster", "gm"])) return 112 + lpBonus(200, 4);
  if (matches(["마스터", "마", "master", "m"])) {
    const floorMatch = value.replace(/\s/gu, "").match(/([1-9]|10)층/u);
    const lp = extractLp(value);
    const floor = floorMatch ? Number(floorMatch[1]) : lp === null ? 1 : clamp(Math.floor(lp / 100) + 1, 1, 10);
    return 82 + (floor - 1) * 3;
  }
  if (matches(["다이아몬드", "다이아", "다", "diamond", "d"])) return 70 + divisionBonus;
  if (matches(["에메랄드", "에메", "에", "emerald", "e"])) return 60 + divisionBonus;
  if (matches(["플래티넘", "플레티넘", "플레", "플", "platinum", "p"])) return 50 + divisionBonus;
  if (matches(["골드", "골", "gold", "g"])) return 40 + divisionBonus;
  if (matches(["실버", "실", "silver", "s"])) return 30 + divisionBonus;
  if (matches(["브론즈", "브", "bronze", "b"])) return 20 + divisionBonus;
  if (matches(["아이언", "아", "iron", "i"])) return 10 + divisionBonus;
  return null;
}

function v1BaseScore(v1: TeamBalanceV1RatingInputs) {
  const current = tierScore(v1.currentTier);
  const peak = tierScore(v1.peakTier);
  const currentScore = current ?? (peak === null ? 30 : round(peak * 0.8));
  const peakScore = peak ?? (current === null ? 30 : current);
  const season = v1.season;
  const inhouse = !season || season.totalGames <= 0
    ? 50
    : round(
        clamp((season.wins / Math.max(1, season.totalGames)) * 100, 0, 100) * 0.5 +
        clamp(season.totalGames * 5, 0, 100) * 0.3 +
        clamp((season.mvpCount / Math.max(1, season.totalGames)) * 500, 0, 100) * 0.2,
      );
  return round(peakScore * 0.6 + currentScore * 0.3 + inhouse * 0.1);
}

function normalizePlayers(input: readonly TeamBalancePlayer[]): readonly NormalizedPlayer[] {
  if (input.length !== 10) throw new TeamBalanceDomainError("PARTICIPANT_COUNT", String(input.length));
  const normalized = input.map((player) => {
    const playerId = player.playerId.trim();
    if (!playerId) throw new TeamBalanceDomainError("INVALID_PLAYER_ID");
    if (player.eligiblePositions.length === 0) throw new TeamBalanceDomainError("MISSING_ELIGIBLE_POSITION", playerId);
    const preferences = new Map<TeamBalancePosition, TeamBalancePreference>();
    for (const eligible of player.eligiblePositions) {
      if (!isPosition(eligible.position)) throw new TeamBalanceDomainError("INVALID_POSITION", playerId);
      if (!isPreference(eligible.preference)) throw new TeamBalanceDomainError("INVALID_PREFERENCE", playerId);
      if (preferences.has(eligible.position)) throw new TeamBalanceDomainError("DUPLICATE_ELIGIBLE_POSITION", playerId);
      preferences.set(eligible.position, eligible.preference);
    }
    for (const position of TEAM_BALANCE_POSITIONS) if (!preferences.has(position)) preferences.set(position, "AUTO");
    const rating = normalizeRating(playerId, player.rating);
    const finalBaseScore = rating.v1 ? v1BaseScore(rating.v1) : round(50 + (rating.overall - 50) * rating.confidence);
    const peakScore = tierScore(rating.v1?.peakTier ?? null) ?? 0;
    return {
      playerId,
      eligiblePositions: preferences,
      rating,
      finalBaseScore,
      sTierBonus: peakScore >= 118 ? 10 : peakScore >= 112 ? 8 : peakScore >= 82 ? 5 : 0,
      highTier: Math.max(tierScore(rating.v1?.currentTier ?? null) ?? 0, peakScore) >= 74,
    };
  });
  normalized.sort((left, right) => comparePlayerOrder(
    left.rating.v1?.legacyPlayerId ?? null,
    left.playerId,
    right.rating.v1?.legacyPlayerId ?? null,
    right.playerId,
  ));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]!.playerId === normalized[index]!.playerId) throw new TeamBalanceDomainError("DUPLICATE_PLAYER_ID", normalized[index]!.playerId);
  }
  return normalized;
}

function comparePlayerOrder(leftLegacyId: number | null, leftId: string, rightLegacyId: number | null, rightId: string) {
  if (leftLegacyId !== null && rightLegacyId !== null) return leftLegacyId - rightLegacyId || compareText(leftId, rightId);
  if (leftLegacyId !== null) return -1;
  if (rightLegacyId !== null) return 1;
  return compareText(leftId, rightId);
}

function preference(player: NormalizedPlayer, position: TeamBalancePosition) {
  return player.eligiblePositions.get(position)!;
}

function reliabilityRate(count: number, bands: readonly (readonly [number, number])[]) {
  for (const [minimum, rate] of bands) if (count >= minimum) return rate;
  return 0;
}

function resolveRating(player: NormalizedPlayer, position: TeamBalancePosition): InternalAssignment["rating"] {
  const positionRating = player.rating.positions[position];
  const hasPositionScore = positionRating?.score !== null && positionRating?.score !== undefined;
  const rawScore = hasPositionScore ? positionRating.score! : player.rating.overall;
  const confidence = positionRating?.confidence ?? player.rating.confidence;
  const sampleSize = hasPositionScore ? positionRating!.sampleSize : player.rating.sampleSize;
  if (!player.rating.v1) {
    return { source: hasPositionScore ? "POSITION" : player.rating.overallSource, rawScore, effectiveScore: round(50 + (rawScore - 50) * confidence), confidence, sampleSize };
  }
  const v1 = player.rating.v1;
  const role = preference(player, position);
  const tierMax = Math.max(tierScore(v1.currentTier) ?? 0, tierScore(v1.peakTier) ?? 0);
  const rolePenalty = role === "MAIN" ? 0 : tierMax >= 82 ? (role === "SUB" ? 18 : 35) : tierMax >= 74 ? (role === "SUB" ? 12 : 25) : role === "SUB" ? 5 : 10;
  const solo = v1.recentSolo;
  const soloReliability = Math.min(1, (solo?.games ?? 0) / 20);
  const soloForm = solo
    ? round(clamp((
        clamp(((solo.wins / Math.max(1, solo.games)) * 100 - 50) / 12.5, -2, 2) +
        (solo.kda === null ? 0 : clamp((solo.kda - 2.5) / 1.25, -1.5, 1.5)) +
        (solo.averageDamage === null ? 0 : clamp((solo.averageDamage - 18_000) / 7_000, -1, 1)) +
        (solo.averageVisionScore === null ? 0 : clamp((solo.averageVisionScore - 20) / 20, -0.5, 0.5))
      ) * soloReliability, -5, 5))
    : 0;
  const internalPositionGames = v1.internalPositionGames[position] ?? 0;
  const internalPositionBonus = internalPositionGames >= 10 ? 2 : internalPositionGames >= 6 ? 1.4 : internalPositionGames >= 3 ? 0.8 : 0;
  const soloPositionBonus = !solo?.mainPosition ? 0
    : solo.mainPosition === position ? 2
      : solo.games >= 10 && role === "MAIN" ? 0.5
        : solo.games >= 10 && role !== "SUB" ? -1.5 : 0;
  let applyBase = 0;
  if (solo?.mainPosition && preference(player, solo.mainPosition) === "MAIN") applyBase = Math.max(applyBase, 3);
  if (solo?.mainPosition && preference(player, solo.mainPosition) === "SUB") applyBase = Math.max(applyBase, 1.5);
  if (solo?.subPosition && preference(player, solo.subPosition) === "MAIN") applyBase = Math.max(applyBase, 2);
  if (solo?.subPosition && preference(player, solo.subPosition) === "SUB") applyBase = Math.max(applyBase, 1);
  if (solo && applyBase === 0 && solo.games >= 10) applyBase = -1.5;
  const lineImpact = { TOP: 1.05, JGL: 1.25, MID: 1.2, ADC: 1.15, SUP: 1 }[position];
  const assignedBoost = solo?.mainPosition === position ? 1 : solo?.subPosition === position ? 0.65 : role === "MAIN" ? 0.35 : 0.2;
  const applyReliability = solo ? Math.min(1, solo.games / 20) * Math.max(0.35, solo.positionConfidence || 0.35) : 0;
  const soloApplyBonus = round(clamp(applyBase * lineImpact * assignedBoost * applyReliability, -2, 4));
  const positionSkill = round(clamp(internalPositionBonus + soloPositionBonus + soloApplyBonus, -3, 3));
  const positionMmr = v1.mmr.positions[position] ?? v1.mmr.overall;
  const mmrBonus = round(clamp(((v1.mmr.overall - 50) * 0.08 + (positionMmr - 50) * 0.12) * v1.mmr.confidence, -6, 6));
  const effectiveScore = round(Math.max(0, player.finalBaseScore + soloForm + positionSkill + mmrBonus + v1.balanceOverrideScore - rolePenalty));
  return { source: "V1", rawScore, effectiveScore, confidence, sampleSize };
}

function permute<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const result: T[][] = [];
  items.forEach((item, index) => {
    const remaining = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const suffix of permute(remaining)) result.push([item, ...suffix]);
  });
  return result;
}

function combinationsWithRedAnchor(length: number) {
  const result: number[][] = [];
  const selected = [0];
  function visit(nextIndex: number) {
    if (selected.length === 5) { result.push([...selected]); return; }
    const remaining = 5 - selected.length;
    for (let index = nextIndex; index <= length - remaining; index += 1) {
      selected.push(index); visit(index + 1); selected.pop();
    }
  }
  visit(1);
  return result;
}

function prepareTeam(team: TeamBalanceTeam, players: readonly NormalizedPlayer[]): PreparedTeam {
  let best: PreparedTeam | null = null;
  let bestKey = Number.NEGATIVE_INFINITY;
  for (const ordered of permute(players)) {
    const assignments = ordered.map((player, index): InternalAssignment => {
      const position = TEAM_BALANCE_POSITIONS[index]!;
      const v1 = player.rating.v1;
      return {
        playerId: player.playerId,
        team,
        position,
        preference: preference(player, position),
        rating: resolveRating(player, position),
        finalBaseScore: player.finalBaseScore,
        sTierBonus: player.sTierBonus,
        highTier: player.highTier,
        internalGames: v1?.internalGames ?? player.rating.sampleSize ?? 0,
        internalPositionGames: v1?.internalPositionGames[position] ?? player.rating.positions[position]?.sampleSize ?? 0,
        recentSoloGames: v1?.recentSolo?.games ?? 0,
        missingSources: v1?.missingSources ?? [],
        legacyPlayerId: v1?.legacyPlayerId ?? null,
      };
    });
    const mainCount = assignments.filter((entry) => entry.preference === "MAIN").length;
    const subCount = assignments.filter((entry) => entry.preference === "SUB").length;
    const autoCount = assignments.filter((entry) => entry.preference === "AUTO").length;
    const priorityMainCount = assignments.filter((entry) => entry.highTier && entry.preference === "MAIN").length;
    const prioritySubCount = assignments.filter((entry) => entry.highTier && entry.preference === "SUB").length;
    const priorityAutoCount = assignments.filter((entry) => entry.highTier && entry.preference === "AUTO").length;
    const total = round(assignments.reduce((sum, entry) => sum + entry.rating.effectiveScore, 0));
    const key = priorityMainCount * 100_000_000 + prioritySubCount * 1_000_000 - priorityAutoCount * 1_000_000 + mainCount * 100_000 + subCount * 10_000 - autoCount * 100 - total;
    if (!best || key > bestKey) {
      best = { assignments, total, mainCount, subCount, autoCount, priorityMainCount, prioritySubCount, priorityAutoCount };
      bestKey = key;
    }
  }
  return best!;
}

function assignmentAt(assignments: readonly InternalAssignment[], team: TeamBalanceTeam, position: TeamBalancePosition) {
  return assignments.find((entry) => entry.team === team && entry.position === position)!;
}

function lineDiff(assignments: readonly InternalAssignment[], position: TeamBalancePosition) {
  return Math.abs(assignmentAt(assignments, "RED", position).rating.effectiveScore - assignmentAt(assignments, "BLUE", position).rating.effectiveScore);
}

function groupDiff(assignments: readonly InternalAssignment[], positions: readonly TeamBalancePosition[]) {
  const total = (team: TeamBalanceTeam) => positions.reduce((sum, position) => sum + assignmentAt(assignments, team, position).rating.effectiveScore, 0);
  return round(Math.abs(total("RED") - total("BLUE")));
}

function gapPenalty(value: number) {
  return value >= 20 ? 12 : value >= 15 ? 8 : value >= 10 ? 5 : value >= 5 ? 2 : 0;
}

function pairPenalty(assignments: readonly InternalAssignment[], positions: readonly TeamBalancePosition[]) {
  const count = (team: TeamBalanceTeam, role: TeamBalancePreference) => positions.filter((position) => assignmentAt(assignments, team, position).preference === role).length;
  return Math.abs(count("RED", "AUTO") - count("BLUE", "AUTO")) * 3 + Math.abs(count("RED", "MAIN") - count("BLUE", "MAIN")) * 1.5;
}

function normalizedMetrics(candidate: Omit<CandidateMetrics, "qualityScore" | "recommendationScore" | "warningMessages">) {
  return {
    total: round(clamp(100 - candidate.diff * 4.2, 0, 100), 1),
    line: round(clamp(100 - candidate.maxLineDiff * 4.4 - candidate.weightedLineDiff * 0.9 - candidate.midJglDiff * 1.15 - candidate.bottomDiff * 0.8, 0, 100), 1),
    position: round(clamp(100 - (candidate.blue.autoCount + candidate.red.autoCount) * 12 - (candidate.blue.subCount + candidate.red.subCount) * 2.4 - candidate.remainingMainPriorityPenalty * 1.4 - candidate.mainImbalancePenalty * 1.1 - candidate.highTierPriorityPenalty * 0.008, 0, 100), 1),
    carry: round(clamp(100 - candidate.topRankStackPenalty * 1.5 - candidate.sTierStackPenalty * 1.4 - candidate.frontSideDiff * 0.7, 0, 100), 1),
    reliability: round(clamp(100 - candidate.dataReliabilityPenalty * 7 - candidate.stompPenalty * 4.5, 0, 100), 1),
  };
}

function getRecommendationScore(candidate: Omit<CandidateMetrics, "recommendationScore" | "warningMessages">) {
  const metrics = normalizedMetrics(candidate);
  const predictedRed = 1 / (1 + 10 ** (candidate.diff / 40));
  const closeness = 100 - Math.abs(50 - round(predictedRed * 100, 1)) * 2;
  const hardRisk = clamp(candidate.highTierPriorityPenalty * 0.012, 0, 22) + clamp(candidate.stompPenalty * 1.2, 0, 16) + clamp((candidate.blue.autoCount + candidate.red.autoCount) * 3.2, 0, 16);
  return round(candidate.qualityScore * 0.34 + metrics.line * 0.22 + metrics.position * 0.2 + metrics.carry * 0.1 + metrics.reliability * 0.06 + closeness * 0.08 - hardRisk);
}

function evaluateCandidate(red: PreparedTeam, blue: PreparedTeam): CandidateMetrics {
  const assignments = [...red.assignments, ...blue.assignments];
  const differences = TEAM_BALANCE_POSITIONS.map((position) => lineDiff(assignments, position));
  const diff = round(Math.abs(red.total - blue.total));
  const lineDiffTotal = round(differences.reduce((sum, value) => sum + value, 0));
  const maxLineDiff = round(Math.max(...differences));
  const weights = { TOP: 1, JGL: 1.25, MID: 1.2, ADC: 1.1, SUP: 1 } as const;
  const weightedLineDiff = round(TEAM_BALANCE_POSITIONS.reduce((sum, position) => sum + lineDiff(assignments, position) * weights[position], 0));
  const topPlayerDiff = round(Math.abs(Math.max(...red.assignments.map((entry) => entry.rating.effectiveScore)) - Math.max(...blue.assignments.map((entry) => entry.rating.effectiveScore))));
  const ranked = [...assignments].sort((left, right) => {
    const scoreOrder = right.finalBaseScore - left.finalBaseScore;
    if (scoreOrder) return scoreOrder;
    return comparePlayerOrder(left.legacyPlayerId, left.playerId, right.legacyPlayerId, right.playerId);
  });
  const topTwoSameTeam = ranked[0]!.team === ranked[1]!.team ? 25 : 0;
  const teamCountDifference = (length: number) => {
    const redCount = ranked.slice(0, length).filter((entry) => entry.team === "RED").length;
    return Math.abs(redCount - (length - redCount));
  };
  const topRankStackPenalty = round(topTwoSameTeam + teamCountDifference(3) * 8 + teamCountDifference(5) * 3);
  const sTierStackPenalty = Math.abs(red.assignments.filter((entry) => entry.sTierBonus >= 5).length - blue.assignments.filter((entry) => entry.sTierBonus >= 5).length) * 12;
  const frontSideDiff = groupDiff(assignments, ["TOP", "JGL", "MID"]);
  const midJglDiff = groupDiff(assignments, ["JGL", "MID"]);
  const bottomDiff = groupDiff(assignments, ["ADC", "SUP"]);
  const autoWeights = { TOP: 2, JGL: 5, MID: 4, ADC: 3, SUP: 3 } as const;
  const autoLinePenalty = assignments.reduce((sum, entry) => sum + (entry.preference === "AUTO" ? autoWeights[entry.position] : 0), 0);
  const mainImbalancePenalty = Math.abs(red.mainCount - blue.mainCount) * 2;
  const dataReliabilityPenalty = round(assignments.reduce((sum, entry) => {
    const recent = reliabilityRate(entry.recentSoloGames, [[15, 1], [10, 0.6], [5, 0.3]]);
    const internal = reliabilityRate(entry.internalGames, [[20, 1], [10, 0.6], [5, 0.3]]);
    const position = reliabilityRate(entry.internalPositionGames, [[10, 1], [6, 0.6], [3, 0.3]]);
    return sum + (1 - recent) * 0.5 + (1 - internal) * 0.7 + (1 - position) * 0.5;
  }, 0));
  const stompPenalty = round(differences.reduce((sum, value) => sum + gapPenalty(value), 0) + gapPenalty(frontSideDiff) * 0.5 + gapPenalty(midJglDiff) * 0.7 + gapPenalty(bottomDiff) * 0.7 + pairPenalty(assignments, ["JGL", "MID"]) + pairPenalty(assignments, ["ADC", "SUP"]));
  const highTierAssignments = assignments.filter((entry) => entry.highTier);
  const highTierRolePenalty = highTierAssignments.reduce((sum, entry) => sum + (entry.preference === "MAIN" ? 0 : entry.preference === "SUB" ? 500 : 2_000), 0);
  const highTierSplitPenalty = Math.abs(highTierAssignments.filter((entry) => entry.team === "RED").length - highTierAssignments.filter((entry) => entry.team === "BLUE").length) * 18;
  const highTierLinePenalty = TEAM_BALANCE_POSITIONS.reduce((sum, position) => {
    const redEntry = assignmentAt(assignments, "RED", position);
    const blueEntry = assignmentAt(assignments, "BLUE", position);
    return sum + (redEntry.highTier === blueEntry.highTier ? 0 : Math.min(10, lineDiff(assignments, position) * 0.45));
  }, 0);
  const highTierPriorityPenalty = round(highTierRolePenalty + highTierSplitPenalty + highTierLinePenalty);
  const remainingMainPriorityPenalty = round(assignments.reduce((sum, entry) => sum + (entry.highTier || entry.preference === "MAIN" ? 0 : entry.preference === "SUB" ? 2 : 8), 0));
  const balanceCost = round(highTierPriorityPenalty * 10 + remainingMainPriorityPenalty * 2 + diff * 1.2 + weightedLineDiff * 0.7 + maxLineDiff + midJglDiff * 0.45 + bottomDiff * 0.45 + autoLinePenalty + mainImbalancePenalty * 0.6 + topRankStackPenalty * 0.35 + sTierStackPenalty * 0.35 + dataReliabilityPenalty * 0.4 + stompPenalty * 0.45);
  const base = { blue, red, assignments, signature: `${blue.assignments.map((entry) => entry.playerId).join(",")}|${red.assignments.map((entry) => entry.playerId).join(",")}`, diff, lineDiffTotal, maxLineDiff, topPlayerDiff, topRankStackPenalty, sTierStackPenalty, weightedLineDiff, frontSideDiff, midJglDiff, bottomDiff, autoLinePenalty, mainImbalancePenalty, dataReliabilityPenalty, stompPenalty, highTierPriorityPenalty, remainingMainPriorityPenalty, balanceCost };
  const metrics = normalizedMetrics(base);
  const qualityScore = round(clamp(metrics.total * 0.24 + metrics.line * 0.28 + metrics.position * 0.2 + metrics.carry * 0.14 + metrics.reliability * 0.14, 0, 100), 1);
  const withQuality = { ...base, qualityScore };
  const recommendationScore = getRecommendationScore(withQuality);
  const warningMessages = [
    highTierPriorityPenalty > 0 ? "고티어 주포지션 이탈이 있습니다." : null,
    red.autoCount + blue.autoCount > 0 ? `AUTO 배정 ${red.autoCount + blue.autoCount}명` : null,
    maxLineDiff >= 12 ? `최대 라인 차이 ${maxLineDiff.toFixed(1)}점` : null,
    midJglDiff >= 10 ? `미드-정글 합산 차이 ${midJglDiff.toFixed(1)}점` : null,
    bottomDiff >= 10 ? `바텀 합산 차이 ${bottomDiff.toFixed(1)}점` : null,
    dataReliabilityPenalty >= 5 ? "일부 플레이어의 데이터 신뢰도가 낮습니다." : null,
  ].filter((value): value is string => value !== null);
  return { ...withQuality, recommendationScore, warningMessages };
}

function compareCandidates(left: CandidateMetrics, right: CandidateMetrics) {
  return right.recommendationScore - left.recommendationScore ||
    right.qualityScore - left.qualityScore ||
    left.diff - right.diff ||
    left.maxLineDiff - right.maxLineDiff ||
    left.midJglDiff - right.midJglDiff ||
    left.bottomDiff - right.bottomDiff ||
    (left.blue.autoCount + left.red.autoCount) - (right.blue.autoCount + right.red.autoCount) ||
    left.balanceCost - right.balanceCost;
}

function materialize(candidate: CandidateMetrics): EvaluatedTeamBalanceLayout {
  const assignments: EvaluatedTeamBalanceAssignment[] = candidate.assignments
    .map((entry) => ({
      playerId: entry.playerId,
      team: entry.team,
      position: entry.position,
      preference: entry.preference,
      rating: entry.rating,
    }))
    .sort((left, right) => TEAM_BALANCE_TEAMS.indexOf(left.team) - TEAM_BALANCE_TEAMS.indexOf(right.team) || TEAM_BALANCE_POSITIONS.indexOf(left.position) - TEAM_BALANCE_POSITIONS.indexOf(right.position));
  const positions = TEAM_BALANCE_POSITIONS.map((position) => {
    const blueScore = assignmentAt(candidate.assignments, "BLUE", position).rating.effectiveScore;
    const redScore = assignmentAt(candidate.assignments, "RED", position).rating.effectiveScore;
    return { position, blueScore, redScore, difference: round(Math.abs(blueScore - redScore)) };
  });
  const totalConfidence = assignments.reduce((sum, entry) => sum + entry.rating.confidence, 0);
  const missingSources = [...new Set(candidate.assignments.flatMap((entry) => entry.missingSources))];
  const redRate = round((1 / (1 + 10 ** ((candidate.blue.total - candidate.red.total) / 40))) * 100, 1);
  return {
    signature: candidate.signature,
    assignments,
    score: {
      teamStrength: { blueTotal: candidate.blue.total, redTotal: candidate.red.total, difference: candidate.diff, weightedPenalty: round(candidate.diff * 1.2) },
      positions,
      positionDifferenceTotal: candidate.lineDiffTotal,
      positionWeightedPenalty: candidate.weightedLineDiff,
      preference: {
        mainCount: candidate.blue.mainCount + candidate.red.mainCount,
        subCount: candidate.blue.subCount + candidate.red.subCount,
        autoCount: candidate.blue.autoCount + candidate.red.autoCount,
        rawPenalty: candidate.remainingMainPriorityPenalty,
        weightedPenalty: candidate.autoLinePenalty,
      },
      uncertainty: {
        averageConfidence: round(totalConfidence / 10),
        noSampleCount: assignments.filter((entry) => entry.rating.sampleSize === null).length,
        rawPenalty: candidate.dataReliabilityPenalty,
        weightedPenalty: candidate.stompPenalty,
      },
      totalPenalty: candidate.balanceCost,
      v1: {
        formulaVersion: TEAM_BALANCE_V1_FORMULA_VERSION,
        qualityScore: candidate.qualityScore,
        recommendationScore: candidate.recommendationScore,
        predictedRedWinRate: redRate,
        predictedBlueWinRate: round(100 - redRate, 1),
        weightedLineDifference: candidate.weightedLineDiff,
        maximumLineDifference: candidate.maxLineDiff,
        frontSideDifference: candidate.frontSideDiff,
        midJungleDifference: candidate.midJglDiff,
        bottomDifference: candidate.bottomDiff,
        highTierPriorityPenalty: candidate.highTierPriorityPenalty,
        remainingMainPriorityPenalty: candidate.remainingMainPriorityPenalty,
        carryDistributionPenalty: candidate.topRankStackPenalty + candidate.sTierStackPenalty,
        stompPenalty: candidate.stompPenalty,
        warnings: candidate.warningMessages,
        missingSources,
      },
    },
  };
}

function evaluateNormalizedLayout(players: readonly NormalizedPlayer[], layout: readonly TeamBalanceLayoutEntry[]) {
  if (layout.length !== 10) throw new TeamBalanceDomainError("INVALID_LAYOUT", `assignment-count:${layout.length}`);
  const playerById = new Map(players.map((player) => [player.playerId, player]));
  const seen = new Set<string>();
  const assignments: InternalAssignment[] = [];
  for (const entry of layout) {
    if (!isTeam(entry.team) || !isPosition(entry.position)) throw new TeamBalanceDomainError("INVALID_LAYOUT", entry.playerId);
    const player = playerById.get(entry.playerId);
    if (!player || seen.has(entry.playerId)) throw new TeamBalanceDomainError("INVALID_LAYOUT", entry.playerId);
    seen.add(entry.playerId);
    assignments.push({
      ...entry,
      preference: preference(player, entry.position),
      rating: resolveRating(player, entry.position),
      finalBaseScore: player.finalBaseScore,
      sTierBonus: player.sTierBonus,
      highTier: player.highTier,
      internalGames: player.rating.v1?.internalGames ?? player.rating.sampleSize ?? 0,
      internalPositionGames: player.rating.v1?.internalPositionGames[entry.position] ?? player.rating.positions[entry.position]?.sampleSize ?? 0,
      recentSoloGames: player.rating.v1?.recentSolo?.games ?? 0,
      missingSources: player.rating.v1?.missingSources ?? [],
      legacyPlayerId: player.rating.v1?.legacyPlayerId ?? null,
    });
  }
  for (const team of TEAM_BALANCE_TEAMS) for (const position of TEAM_BALANCE_POSITIONS) {
    if (assignments.filter((entry) => entry.team === team && entry.position === position).length !== 1) throw new TeamBalanceDomainError("INVALID_LAYOUT", `${team}:${position}`);
  }
  const toPrepared = (team: TeamBalanceTeam): PreparedTeam => {
    const teamAssignments = TEAM_BALANCE_POSITIONS.map((position) => assignmentAt(assignments, team, position));
    return {
      assignments: teamAssignments,
      total: round(teamAssignments.reduce((sum, entry) => sum + entry.rating.effectiveScore, 0)),
      mainCount: teamAssignments.filter((entry) => entry.preference === "MAIN").length,
      subCount: teamAssignments.filter((entry) => entry.preference === "SUB").length,
      autoCount: teamAssignments.filter((entry) => entry.preference === "AUTO").length,
      priorityMainCount: teamAssignments.filter((entry) => entry.highTier && entry.preference === "MAIN").length,
      prioritySubCount: teamAssignments.filter((entry) => entry.highTier && entry.preference === "SUB").length,
      priorityAutoCount: teamAssignments.filter((entry) => entry.highTier && entry.preference === "AUTO").length,
    };
  };
  return materialize(evaluateCandidate(toPrepared("RED"), toPrepared("BLUE")));
}

/** Manual layouts are always recomputed on the server with the same V1 score model. */
export function evaluateTeamBalanceLayout(input: readonly TeamBalancePlayer[], layout: readonly TeamBalanceLayoutEntry[]) {
  return evaluateNormalizedLayout(normalizePlayers(input), layout);
}

/**
 * V1-compatible search: anchor the first legacy-ordered player in RED, choose each
 * team's best position permutation, then select one AI-global recommendation.
 */
export function calculateTeamBalanceCandidates(input: readonly TeamBalancePlayer[], limit = 1): TeamBalanceCalculation {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 3) throw new RangeError("Team balance candidate limit must be between 1 and 3.");
  const players = normalizePlayers(input);
  const combinations = combinationsWithRedAnchor(players.length);
  const candidates: CandidateMetrics[] = [];
  for (const redIndexes of combinations) {
    const redSet = new Set(redIndexes);
    const red = prepareTeam("RED", players.filter((_, index) => redSet.has(index)));
    const blue = prepareTeam("BLUE", players.filter((_, index) => !redSet.has(index)));
    candidates.push(evaluateCandidate(red, blue));
  }
  if (candidates.length === 0) throw new TeamBalanceDomainError("NO_FEASIBLE_LAYOUT");
  candidates.sort(compareCandidates);
  return {
    candidates: [{ ...materialize(candidates[0]!), rank: 1 }],
    search: { symmetryAnchorPlayerId: players[0]!.playerId, teamCombinationCount: combinations.length, feasibleLayoutCount: candidates.length },
  };
}
