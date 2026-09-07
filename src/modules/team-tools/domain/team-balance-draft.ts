import type {
  EvaluatedTeamBalanceLayout,
  TeamBalanceEligibility,
  TeamBalanceRatingProviderDto,
} from "./team-balance";

export const TEAM_BALANCE_DRAFT_RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;
export const TEAM_BALANCE_DRAFT_STATUSES = ["EVALUATED", "SAVED", "ARCHIVED"] as const;

export type TeamBalanceDraftStatus = (typeof TEAM_BALANCE_DRAFT_STATUSES)[number];
export type TeamBalanceDraftAuthorization = "APPROVED_ACCOUNT_MUTATION" | "ADMIN_MUTATION";

export type TeamBalanceDraftParticipant = Readonly<{
  playerId: string;
  displayName: string;
  ordinal: number;
  eligiblePositions: readonly TeamBalanceEligibility[];
  rating: TeamBalanceRatingProviderDto | null;
}>;

export type TeamBalanceDraftCandidate = EvaluatedTeamBalanceLayout &
  Readonly<{
    id: string;
    evaluationRound: number;
    source: "AUTO" | "MANUAL";
    rank: number | null;
  }>;

export type TeamBalanceDraft = Readonly<{
  id: string;
  ownerUserAccountId: string;
  title: string;
  status: TeamBalanceDraftStatus;
  evaluationRound: number;
  ratingGeneration: number | null;
  selectedCandidateSource: "AUTO" | "MANUAL" | null;
  selectedCandidateSignature: string | null;
  revision: number;
  participants: readonly TeamBalanceDraftParticipant[];
  candidates: readonly TeamBalanceDraftCandidate[];
  createdAt: string;
  updatedAt: string;
}>;

export type TeamBalanceDraftSummary = Readonly<{
  id: string;
  title: string;
  status: TeamBalanceDraftStatus;
  evaluationRound: number;
  ratingGeneration: number | null;
  revision: number;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type TeamBalanceDraftCatalog = Readonly<{
  items: readonly TeamBalanceDraftSummary[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}>;

export type TeamBalanceServiceErrorCode =
  | "FORBIDDEN"
  | "IDEMPOTENCY_MISMATCH"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "NOT_FOUND"
  | "PRECONDITION_FAILED"
  | "SESSION_STALE";

export class TeamBalanceServiceError extends Error {
  constructor(
    readonly code: TeamBalanceServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TeamBalanceServiceError";
  }
}

export function canonicalTeamBalanceJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalTeamBalanceJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalTeamBalanceJson(record[key])}`)
    .join(",")}}`;
}
