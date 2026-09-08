export const TEAM_BALANCE_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
export const TEAM_BALANCE_TEAMS = ["BLUE", "RED"] as const;
export const TEAM_BALANCE_PREFERENCES = ["MAIN", "SUB", "AUTO"] as const;

export type TeamBalancePosition = (typeof TEAM_BALANCE_POSITIONS)[number];
export type TeamBalanceTeam = (typeof TEAM_BALANCE_TEAMS)[number];
export type TeamBalancePreference = (typeof TEAM_BALANCE_PREFERENCES)[number];

export const TEAM_BALANCE_PLAYER_COUNT = 10;
export const TEAM_BALANCE_TEAM_SIZE = 5;
export const DEFAULT_TEAM_BALANCE_SCORE = 50;
export const DEFAULT_TEAM_BALANCE_CONFIDENCE = 0;

export const TEAM_BALANCE_SCORING_WEIGHTS = Object.freeze({
  teamStrengthDifference: 100,
  positionStrengthDifference: 10,
  preference: 100,
  uncertainty: 1,
} as const);

export const TEAM_BALANCE_PREFERENCE_PENALTIES = Object.freeze({
  MAIN: 0,
  SUB: 3,
  AUTO: 8,
} as const satisfies Readonly<Record<TeamBalancePreference, number>>);

export type TeamBalancePositionRatingDto = Readonly<{
  score: number | null;
  confidence: number | null;
  sampleSize: number | null;
}>;

/** Nullable read model supplied by the later S05 provider boundary. */
export type TeamBalanceRatingProviderDto = Readonly<{
  overall: number | null;
  confidence: number | null;
  sampleSize: number | null;
  positions: Readonly<Partial<Record<TeamBalancePosition, TeamBalancePositionRatingDto | null>>> | null;
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

export type TeamBalanceRatingSource = "POSITION" | "OVERALL" | "DEFAULT";

export type EvaluatedTeamBalanceAssignment = TeamBalanceLayoutEntry &
  Readonly<{
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
  constructor(
    readonly code: TeamBalanceDomainErrorCode,
    readonly subject?: string,
  ) {
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
}>;

type NormalizedPlayer = Readonly<{
  playerId: string;
  eligiblePositions: ReadonlyMap<TeamBalancePosition, TeamBalancePreference>;
  rating: NormalizedRating;
}>;

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPosition(value: unknown): value is TeamBalancePosition {
  return TEAM_BALANCE_POSITIONS.includes(value as TeamBalancePosition);
}

function isTeam(value: unknown): value is TeamBalanceTeam {
  return TEAM_BALANCE_TEAMS.includes(value as TeamBalanceTeam);
}

function isPreference(value: unknown): value is TeamBalancePreference {
  return TEAM_BALANCE_PREFERENCES.includes(value as TeamBalancePreference);
}

function validateScore(value: number | null, subject: string) {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
    throw new TeamBalanceDomainError("INVALID_SCORE", subject);
  }
}

function validateConfidence(value: number | null, subject: string) {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new TeamBalanceDomainError("INVALID_SCORE", subject);
  }
}

function validateSampleSize(value: number | null, subject: string) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TeamBalanceDomainError("INVALID_SCORE", subject);
  }
}

function normalizeRating(playerId: string, value: TeamBalanceRatingProviderDto | null): NormalizedRating {
  if (value === null) {
    return {
      overall: DEFAULT_TEAM_BALANCE_SCORE,
      overallSource: "DEFAULT",
      confidence: DEFAULT_TEAM_BALANCE_CONFIDENCE,
      sampleSize: null,
      positions: {},
    };
  }

  validateScore(value.overall, `${playerId}.overall`);
  validateConfidence(value.confidence, `${playerId}.confidence`);
  validateSampleSize(value.sampleSize, `${playerId}.sampleSize`);

  const positions = value.positions ?? {};
  for (const [key, positionRating] of Object.entries(positions)) {
    if (!isPosition(key)) throw new TeamBalanceDomainError("INVALID_POSITION", `${playerId}.${key}`);
    if (positionRating === null || positionRating === undefined) continue;
    validateScore(positionRating.score, `${playerId}.${key}.score`);
    validateConfidence(positionRating.confidence, `${playerId}.${key}.confidence`);
    validateSampleSize(positionRating.sampleSize, `${playerId}.${key}.sampleSize`);
  }

  return {
    overall: value.overall ?? DEFAULT_TEAM_BALANCE_SCORE,
    overallSource: value.overall === null ? "DEFAULT" : "OVERALL",
    confidence: value.confidence ?? DEFAULT_TEAM_BALANCE_CONFIDENCE,
    sampleSize: value.sampleSize,
    positions,
  };
}

function normalizePlayers(input: readonly TeamBalancePlayer[]): readonly NormalizedPlayer[] {
  if (input.length !== TEAM_BALANCE_PLAYER_COUNT) {
    throw new TeamBalanceDomainError("PARTICIPANT_COUNT", String(input.length));
  }

  const normalized = input.map((player) => {
    const playerId = player.playerId.trim();
    if (!playerId) throw new TeamBalanceDomainError("INVALID_PLAYER_ID");
    if (player.eligiblePositions.length === 0) {
      throw new TeamBalanceDomainError("MISSING_ELIGIBLE_POSITION", playerId);
    }

    const eligiblePositions = new Map<TeamBalancePosition, TeamBalancePreference>();
    for (const eligible of player.eligiblePositions) {
      if (!isPosition(eligible.position)) {
        throw new TeamBalanceDomainError("INVALID_POSITION", playerId);
      }
      if (!isPreference(eligible.preference)) {
        throw new TeamBalanceDomainError("INVALID_PREFERENCE", playerId);
      }
      if (eligiblePositions.has(eligible.position)) {
        throw new TeamBalanceDomainError("DUPLICATE_ELIGIBLE_POSITION", playerId);
      }
      eligiblePositions.set(eligible.position, eligible.preference);
    }

    return {
      playerId,
      eligiblePositions,
      rating: normalizeRating(playerId, player.rating),
    };
  });

  normalized.sort((left, right) => compareText(left.playerId, right.playerId));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]!.playerId === normalized[index]!.playerId) {
      throw new TeamBalanceDomainError("DUPLICATE_PLAYER_ID", normalized[index]!.playerId);
    }
  }
  return normalized;
}

function resolveRating(
  player: NormalizedPlayer,
  position: TeamBalancePosition,
): EvaluatedTeamBalanceAssignment["rating"] {
  const positionRating = player.rating.positions[position];
  const hasPositionScore = positionRating?.score !== null && positionRating?.score !== undefined;
  const rawScore = hasPositionScore ? positionRating.score! : player.rating.overall;
  const confidence = positionRating?.confidence ?? player.rating.confidence;
  const sampleSize = hasPositionScore ? positionRating!.sampleSize : player.rating.sampleSize;
  const effectiveBasisPoints = Math.round(
    (DEFAULT_TEAM_BALANCE_SCORE + (rawScore - DEFAULT_TEAM_BALANCE_SCORE) * confidence) * 100,
  );

  return {
    source: hasPositionScore ? "POSITION" : player.rating.overallSource,
    rawScore,
    effectiveScore: effectiveBasisPoints / 100,
    confidence,
    sampleSize,
  };
}

function enumeratePositionAssignments(players: readonly NormalizedPlayer[]) {
  const results: NormalizedPlayer[][] = [];
  const selected: NormalizedPlayer[] = [];
  const usedPlayerIds = new Set<string>();

  function visit(positionIndex: number) {
    if (positionIndex === TEAM_BALANCE_POSITIONS.length) {
      results.push([...selected]);
      return;
    }

    const position = TEAM_BALANCE_POSITIONS[positionIndex]!;
    for (const player of players) {
      if (usedPlayerIds.has(player.playerId) || !player.eligiblePositions.has(position)) continue;
      usedPlayerIds.add(player.playerId);
      selected.push(player);
      visit(positionIndex + 1);
      selected.pop();
      usedPlayerIds.delete(player.playerId);
    }
  }

  visit(0);
  return results;
}

function combinationsWithAnchor(length: number) {
  const results: number[][] = [];
  const selected = [0];

  function visit(nextIndex: number) {
    if (selected.length === TEAM_BALANCE_TEAM_SIZE) {
      results.push([...selected]);
      return;
    }

    const remaining = TEAM_BALANCE_TEAM_SIZE - selected.length;
    for (let index = nextIndex; index <= length - remaining; index += 1) {
      selected.push(index);
      visit(index + 1);
      selected.pop();
    }
  }

  visit(1);
  return results;
}

type PreparedTeamAssignment = Readonly<{
  assignments: readonly EvaluatedTeamBalanceAssignment[];
  signature: string;
  scoreBasisPoints: readonly number[];
  totalBasisPoints: number;
  preferenceRawPenalty: number;
  confidenceTotal: number;
  uncertaintyRawPenalty: number;
  noSampleCount: number;
}>;

type TeamBalanceKernelScore = Readonly<{
  blueTotalBasisPoints: number;
  redTotalBasisPoints: number;
  teamDifferenceBasisPoints: number;
  positionDifferenceBasisPoints: number;
  preferenceRawPenalty: number;
  confidenceTotal: number;
  uncertaintyRawPenalty: number;
  noSampleCount: number;
  teamWeightedPenalty: number;
  positionWeightedPenalty: number;
  preferenceWeightedPenalty: number;
  uncertaintyWeightedPenalty: number;
  totalPenalty: number;
}>;

type InternalCandidate = Readonly<{
  blue: PreparedTeamAssignment;
  red: PreparedTeamAssignment;
  signature: string;
  kernel: TeamBalanceKernelScore;
}>;

function prepareTeamAssignment(
  assignments: readonly EvaluatedTeamBalanceAssignment[],
): PreparedTeamAssignment {
  const scoreBasisPoints = assignments.map((entry) => Math.round(entry.rating.effectiveScore * 100));
  const confidenceTotal = assignments.reduce(
    (sum, entry) => sum + Math.round(entry.rating.confidence * 100),
    0,
  );

  return {
    assignments,
    signature: assignments.map((entry) => entry.playerId).join(","),
    scoreBasisPoints,
    totalBasisPoints: scoreBasisPoints.reduce((sum, score) => sum + score, 0),
    preferenceRawPenalty: assignments.reduce(
      (sum, entry) => sum + TEAM_BALANCE_PREFERENCE_PENALTIES[entry.preference],
      0,
    ),
    confidenceTotal,
    uncertaintyRawPenalty: TEAM_BALANCE_TEAM_SIZE * 100 - confidenceTotal,
    noSampleCount: assignments.filter((entry) => entry.rating.sampleSize === null).length,
  };
}

/** Single integer scoring kernel shared by automatic search and manual evaluation. */
function scoreKernel(
  blue: PreparedTeamAssignment,
  red: PreparedTeamAssignment,
): TeamBalanceKernelScore {
  const teamDifferenceBasisPoints = Math.abs(blue.totalBasisPoints - red.totalBasisPoints);
  let positionDifferenceBasisPoints = 0;
  for (let index = 0; index < TEAM_BALANCE_POSITIONS.length; index += 1) {
    positionDifferenceBasisPoints += Math.abs(
      blue.scoreBasisPoints[index]! - red.scoreBasisPoints[index]!,
    );
  }
  const preferenceRawPenalty = blue.preferenceRawPenalty + red.preferenceRawPenalty;
  const confidenceTotal = blue.confidenceTotal + red.confidenceTotal;
  const uncertaintyRawPenalty = blue.uncertaintyRawPenalty + red.uncertaintyRawPenalty;
  const teamWeightedPenalty =
    teamDifferenceBasisPoints * TEAM_BALANCE_SCORING_WEIGHTS.teamStrengthDifference;
  const positionWeightedPenalty =
    positionDifferenceBasisPoints * TEAM_BALANCE_SCORING_WEIGHTS.positionStrengthDifference;
  const preferenceWeightedPenalty =
    preferenceRawPenalty * TEAM_BALANCE_SCORING_WEIGHTS.preference;
  const uncertaintyWeightedPenalty =
    uncertaintyRawPenalty * TEAM_BALANCE_SCORING_WEIGHTS.uncertainty;

  return {
    blueTotalBasisPoints: blue.totalBasisPoints,
    redTotalBasisPoints: red.totalBasisPoints,
    teamDifferenceBasisPoints,
    positionDifferenceBasisPoints,
    preferenceRawPenalty,
    confidenceTotal,
    uncertaintyRawPenalty,
    noSampleCount: blue.noSampleCount + red.noSampleCount,
    teamWeightedPenalty,
    positionWeightedPenalty,
    preferenceWeightedPenalty,
    uncertaintyWeightedPenalty,
    totalPenalty:
      teamWeightedPenalty +
      positionWeightedPenalty +
      preferenceWeightedPenalty +
      uncertaintyWeightedPenalty,
  };
}

function materializeLayout(candidate: InternalCandidate): EvaluatedTeamBalanceLayout {
  const assignments = [...candidate.blue.assignments, ...candidate.red.assignments];
  const preferenceCounts = {
    MAIN: assignments.filter((entry) => entry.preference === "MAIN").length,
    SUB: assignments.filter((entry) => entry.preference === "SUB").length,
    AUTO: assignments.filter((entry) => entry.preference === "AUTO").length,
  };
  const positions = TEAM_BALANCE_POSITIONS.map((position, index) => {
    const blueScore = candidate.blue.scoreBasisPoints[index]!;
    const redScore = candidate.red.scoreBasisPoints[index]!;
    return {
      position,
      blueScore: blueScore / 100,
      redScore: redScore / 100,
      difference: Math.abs(blueScore - redScore) / 100,
    };
  });

  return {
    signature: candidate.signature,
    assignments,
    score: {
      teamStrength: {
        blueTotal: candidate.kernel.blueTotalBasisPoints / 100,
        redTotal: candidate.kernel.redTotalBasisPoints / 100,
        difference: candidate.kernel.teamDifferenceBasisPoints / 100,
        weightedPenalty: candidate.kernel.teamWeightedPenalty,
      },
      positions,
      positionDifferenceTotal: candidate.kernel.positionDifferenceBasisPoints / 100,
      positionWeightedPenalty: candidate.kernel.positionWeightedPenalty,
      preference: {
        mainCount: preferenceCounts.MAIN,
        subCount: preferenceCounts.SUB,
        autoCount: preferenceCounts.AUTO,
        rawPenalty: candidate.kernel.preferenceRawPenalty,
        weightedPenalty: candidate.kernel.preferenceWeightedPenalty,
      },
      uncertainty: {
        averageConfidence: candidate.kernel.confidenceTotal / TEAM_BALANCE_PLAYER_COUNT / 100,
        noSampleCount: candidate.kernel.noSampleCount,
        rawPenalty: candidate.kernel.uncertaintyRawPenalty,
        weightedPenalty: candidate.kernel.uncertaintyWeightedPenalty,
      },
      totalPenalty: candidate.kernel.totalPenalty,
    },
  };
}

function compareInternalCandidates(left: InternalCandidate, right: InternalCandidate) {
  return (
    left.kernel.totalPenalty - right.kernel.totalPenalty ||
    left.kernel.teamDifferenceBasisPoints - right.kernel.teamDifferenceBasisPoints ||
    left.kernel.positionDifferenceBasisPoints - right.kernel.positionDifferenceBasisPoints ||
    left.kernel.preferenceRawPenalty - right.kernel.preferenceRawPenalty ||
    left.kernel.uncertaintyRawPenalty - right.kernel.uncertaintyRawPenalty ||
    compareText(left.signature, right.signature)
  );
}

function comparePositionBalanceCandidates(left: InternalCandidate, right: InternalCandidate) {
  return (
    left.kernel.positionDifferenceBasisPoints - right.kernel.positionDifferenceBasisPoints ||
    left.kernel.teamDifferenceBasisPoints - right.kernel.teamDifferenceBasisPoints ||
    left.kernel.preferenceRawPenalty - right.kernel.preferenceRawPenalty ||
    left.kernel.uncertaintyRawPenalty - right.kernel.uncertaintyRawPenalty ||
    left.kernel.totalPenalty - right.kernel.totalPenalty ||
    compareText(left.signature, right.signature)
  );
}

function comparePreferencePriorityCandidates(left: InternalCandidate, right: InternalCandidate) {
  return (
    left.kernel.preferenceRawPenalty - right.kernel.preferenceRawPenalty ||
    left.kernel.teamDifferenceBasisPoints - right.kernel.teamDifferenceBasisPoints ||
    left.kernel.positionDifferenceBasisPoints - right.kernel.positionDifferenceBasisPoints ||
    left.kernel.uncertaintyRawPenalty - right.kernel.uncertaintyRawPenalty ||
    left.kernel.totalPenalty - right.kernel.totalPenalty ||
    compareText(left.signature, right.signature)
  );
}

function insertCandidate(
  candidates: InternalCandidate[],
  candidate: InternalCandidate,
  limit: number,
  compare: (left: InternalCandidate, right: InternalCandidate) => number,
) {
  candidates.push(candidate);
  candidates.sort(compare);
  if (candidates.length > limit) candidates.pop();
}

function prepareEnumeratedTeam(
  playersByPosition: readonly NormalizedPlayer[],
  team: TeamBalanceTeam,
) {
  return prepareTeamAssignment(
    playersByPosition.map((player, index) => {
      const position = TEAM_BALANCE_POSITIONS[index]!;
      return {
        playerId: player.playerId,
        team,
        position,
        preference: player.eligiblePositions.get(position)!,
        rating: resolveRating(player, position),
      };
    }),
  );
}

function scoreNormalizedLayout(
  players: readonly NormalizedPlayer[],
  layout: readonly TeamBalanceLayoutEntry[],
): EvaluatedTeamBalanceLayout {
  if (layout.length !== TEAM_BALANCE_PLAYER_COUNT) {
    throw new TeamBalanceDomainError("INVALID_LAYOUT", `assignment-count:${layout.length}`);
  }

  const playerById = new Map(players.map((player) => [player.playerId, player]));
  const assignedIds = new Set<string>();
  const evaluated: EvaluatedTeamBalanceAssignment[] = [];

  for (const entry of layout) {
    if (!isTeam(entry.team) || !isPosition(entry.position)) {
      throw new TeamBalanceDomainError("INVALID_LAYOUT", entry.playerId);
    }
    const player = playerById.get(entry.playerId);
    if (!player || assignedIds.has(entry.playerId)) {
      throw new TeamBalanceDomainError("INVALID_LAYOUT", entry.playerId);
    }
    const preference = player.eligiblePositions.get(entry.position);
    if (!preference) throw new TeamBalanceDomainError("INVALID_LAYOUT", entry.playerId);
    assignedIds.add(entry.playerId);
    evaluated.push({ ...entry, preference, rating: resolveRating(player, entry.position) });
  }

  evaluated.sort((left, right) => {
    const teamOrder = TEAM_BALANCE_TEAMS.indexOf(left.team) - TEAM_BALANCE_TEAMS.indexOf(right.team);
    return teamOrder || TEAM_BALANCE_POSITIONS.indexOf(left.position) - TEAM_BALANCE_POSITIONS.indexOf(right.position);
  });
  if (assignedIds.size !== players.length) throw new TeamBalanceDomainError("INVALID_LAYOUT");
  for (let teamIndex = 0; teamIndex < TEAM_BALANCE_TEAMS.length; teamIndex += 1) {
    const offset = teamIndex * TEAM_BALANCE_TEAM_SIZE;
    for (let positionIndex = 0; positionIndex < TEAM_BALANCE_POSITIONS.length; positionIndex += 1) {
      const entry = evaluated[offset + positionIndex];
      if (
        entry?.team !== TEAM_BALANCE_TEAMS[teamIndex] ||
        entry.position !== TEAM_BALANCE_POSITIONS[positionIndex]
      ) {
        throw new TeamBalanceDomainError("INVALID_LAYOUT", TEAM_BALANCE_TEAMS[teamIndex]);
      }
    }
  }

  const blue = prepareTeamAssignment(evaluated.slice(0, TEAM_BALANCE_TEAM_SIZE));
  const red = prepareTeamAssignment(evaluated.slice(TEAM_BALANCE_TEAM_SIZE));
  const candidate = {
    blue,
    red,
    signature: `${blue.signature}|${red.signature}`,
    kernel: scoreKernel(blue, red),
  };
  return materializeLayout(candidate);
}

/** The manual re-evaluation entry point. Automatic search calls the same scoring kernel. */
export function evaluateTeamBalanceLayout(
  input: readonly TeamBalancePlayer[],
  layout: readonly TeamBalanceLayoutEntry[],
): EvaluatedTeamBalanceLayout {
  return scoreNormalizedLayout(normalizePlayers(input), layout);
}

/**
 * Exhaustively evaluates every feasible 5:5 split and in-team position bijection.
 * Mirrored RED/BLUE splits are removed by anchoring the lowest playerId in BLUE.
 */
export function calculateTeamBalanceCandidates(
  input: readonly TeamBalancePlayer[],
  limit = 3,
): TeamBalanceCalculation {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 3) {
    throw new RangeError("Team balance candidate limit must be between 1 and 3.");
  }

  const players = normalizePlayers(input);
  const criterionPools = [
    { compare: compareInternalCandidates, candidates: [] as InternalCandidate[] },
    { compare: comparePositionBalanceCandidates, candidates: [] as InternalCandidate[] },
    { compare: comparePreferencePriorityCandidates, candidates: [] as InternalCandidate[] },
  ] as const;
  const teamCombinations = combinationsWithAnchor(players.length);
  let feasibleLayoutCount = 0;

  for (const blueIndexes of teamCombinations) {
    const blueIndexSet = new Set(blueIndexes);
    const bluePlayers = players.filter((_, index) => blueIndexSet.has(index));
    const redPlayers = players.filter((_, index) => !blueIndexSet.has(index));
    const blueAssignments = enumeratePositionAssignments(bluePlayers).map((assignment) =>
      prepareEnumeratedTeam(assignment, "BLUE"),
    );
    if (blueAssignments.length === 0) continue;
    const redAssignments = enumeratePositionAssignments(redPlayers).map((assignment) =>
      prepareEnumeratedTeam(assignment, "RED"),
    );

    for (const blue of blueAssignments) {
      for (const red of redAssignments) {
        feasibleLayoutCount += 1;
        const candidate = {
          blue,
          red,
          signature: `${blue.signature}|${red.signature}`,
          kernel: scoreKernel(blue, red),
        };
        for (const pool of criterionPools) {
          insertCandidate(pool.candidates, candidate, 3, pool.compare);
        }
      }
    }
  }

  if (feasibleLayoutCount === 0) throw new TeamBalanceDomainError("NO_FEASIBLE_LAYOUT");

  const selectedCandidates: InternalCandidate[] = [];
  const selectedSignatures = new Set<string>();
  for (const pool of criterionPools.slice(0, limit)) {
    const candidate = pool.candidates.find((entry) => !selectedSignatures.has(entry.signature));
    if (!candidate) continue;
    selectedCandidates.push(candidate);
    selectedSignatures.add(candidate.signature);
  }

  return {
    candidates: selectedCandidates.map((candidate, index) => ({
      ...materializeLayout(candidate),
      rank: index + 1,
    })),
    search: {
      symmetryAnchorPlayerId: players[0]!.playerId,
      teamCombinationCount: teamCombinations.length,
      feasibleLayoutCount,
    },
  };
}
