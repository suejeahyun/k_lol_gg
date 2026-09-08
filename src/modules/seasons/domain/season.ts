export const SEASON_STATUSES = ["DRAFT", "ACTIVE", "ENDED", "RETIRED"] as const;
export const SEASON_APPLICATION_STATUSES = [
  "APPLIED",
  "RESERVE",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
] as const;
export const SEASON_APPLICATION_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;
export const SEASON_APPLICATION_SOURCES = ["SITE", "KAKAO"] as const;
export const SEASON_KAKAO_PENDING_MATCH_STATES = ["MATCHED_RESERVE", "UNMATCHED", "AMBIGUOUS"] as const;
export const SEASON_KAKAO_PENDING_STATUSES = ["ACTIVE", "CANCELLED", "RESOLVED"] as const;
export const SEASON_COMMAND_RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;

export type SeasonStatus = (typeof SEASON_STATUSES)[number];
export type SeasonApplicationStatus = (typeof SEASON_APPLICATION_STATUSES)[number];
export type SeasonApplicationPosition = (typeof SEASON_APPLICATION_POSITIONS)[number];
export type SeasonApplicationSource = (typeof SEASON_APPLICATION_SOURCES)[number];
export type SeasonKakaoPendingMatchState = (typeof SEASON_KAKAO_PENDING_MATCH_STATES)[number];
export type SeasonKakaoPendingStatus = (typeof SEASON_KAKAO_PENDING_STATUSES)[number];

export type PublicSeason = Readonly<{
  id: string;
  name: string;
  status: SeasonStatus;
  applicationsOpen: boolean;
  applicationsOpenAt: string | null;
  applicationsCloseAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
}>;

export type PublicSeasonParticipant = Readonly<{
  player: Readonly<{ id: string; displayName: string; riotId: string }>;
  applyDate: string;
  recruitNo: number;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  status: "APPLIED" | "RESERVE" | "CONFIRMED";
}>;

export type OwnSeasonApplication = Readonly<{
  id: string;
  seasonId: string;
  applyDate: string;
  recruitNo: number;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  status: SeasonApplicationStatus;
  source: SeasonApplicationSource;
  revision: number;
  updatedAt: string;
}>;

export type ApplicationHub = Readonly<{
  currentSeason: PublicSeason | null;
  myApplication: OwnSeasonApplication | null;
  participants: readonly PublicSeasonParticipant[];
  counts: Readonly<{ applied: number; reserve: number; confirmed: number }>;
  viewer: "ANONYMOUS" | "RESTRICTED" | "APPROVED";
  canApply: boolean;
  hasActivePlayer: boolean;
  participantTotal: number;
  participantsTruncated: boolean;
  selectedRecruitNo: number;
  availableRecruitNos: readonly number[];
}>;

export type AdminSeasonKakaoPendingApplication = Readonly<{
  id: string;
  seasonId: string;
  seasonName: string;
  applyDate: string;
  recruitNo: number;
  slotNo: number;
  suppliedName: string;
  suppliedRiotId: string | null;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  reserve: boolean;
  matchState: SeasonKakaoPendingMatchState;
  status: SeasonKakaoPendingStatus;
  matchedPlayer: Readonly<{ id: string; displayName: string; riotId: string }> | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type AdminSeasonKakaoPendingPage = Readonly<{
  applications: readonly AdminSeasonKakaoPendingApplication[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}>;

export type AdminSeasonKakaoPendingDetail = Readonly<{
  application: AdminSeasonKakaoPendingApplication;
  candidates: readonly Readonly<{ id: string; displayName: string; riotId: string }>[];
  candidateQuery: string;
}>;

/** Safe, deliberately small hand-off projection for the team-balance application layer. */
export type ConfirmedSeasonTeamBalanceRoster = Readonly<{
  season: Readonly<{ id: string; name: string }>;
  applyDate: string;
  recruitNo: number;
  participants: readonly Readonly<{
    playerId: string;
    displayName: string;
    mainPosition: SeasonApplicationPosition;
    subPositions: readonly SeasonApplicationPosition[];
  }>[];
}>;

export type AdminSeason = Readonly<{
  id: string;
  legacyId: number | null;
  name: string;
  status: SeasonStatus;
  applicationsOpenAt: string | null;
  applicationsCloseAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  clonedFromSeasonId: string | null;
  revision: number;
  applicationCount: number;
  activatedAt: string | null;
  endedAt: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AdminSeasonApplication = Readonly<{
  id: string;
  seasonId: string;
  seasonName: string;
  player: Readonly<{
    id: string;
    memberName: string;
    displayName: string;
    riotId: string;
  }>;
  applyDate: string;
  recruitNo: number;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  status: SeasonApplicationStatus;
  source: SeasonApplicationSource;
  reviewNote: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type AdminSeasonWorkspace = Readonly<{
  seasons: readonly AdminSeason[];
  applications: readonly AdminSeasonApplication[];
  applicationPage: number;
  applicationPageSize: number;
  applicationTotalCount: number;
  applicationTotalPages: number;
}>;

export function isSeasonApplicationPosition(value: unknown): value is SeasonApplicationPosition {
  return (
    typeof value === "string" &&
    SEASON_APPLICATION_POSITIONS.includes(value as SeasonApplicationPosition)
  );
}

export function isSeasonApplicationStatus(value: unknown): value is SeasonApplicationStatus {
  return (
    typeof value === "string" &&
    SEASON_APPLICATION_STATUSES.includes(value as SeasonApplicationStatus)
  );
}

export function isSeasonKakaoPendingMatchState(value: unknown): value is SeasonKakaoPendingMatchState {
  return typeof value === "string" && SEASON_KAKAO_PENDING_MATCH_STATES.includes(value as SeasonKakaoPendingMatchState);
}

export function isSeasonKakaoPendingStatus(value: unknown): value is SeasonKakaoPendingStatus {
  return typeof value === "string" && SEASON_KAKAO_PENDING_STATUSES.includes(value as SeasonKakaoPendingStatus);
}

export function normalizeSeasonName(value: string): string {
  return value.trim().normalize("NFKC").replace(/\s+/g, " ");
}

export function normalizedSeasonIdentity(value: string): string {
  return normalizeSeasonName(value).toLocaleLowerCase("ko-KR");
}

export function kstDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function seasonAcceptsApplications(
  season: {
    status: SeasonStatus;
    applicationsOpenAt: Date | null;
    applicationsCloseAt: Date | null;
  },
  now: Date,
): boolean {
  return (
    season.status === "ACTIVE" &&
    (!season.applicationsOpenAt || season.applicationsOpenAt <= now) &&
    (!season.applicationsCloseAt || season.applicationsCloseAt > now)
  );
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export const SEASON_SERVICE_ERROR_CODES = [
  "ACTIVE_SEASON_EXISTS",
  "APPLICATION_CLOSED",
  "APPLICATION_REVIEWED",
  "DUPLICATE",
  "FORBIDDEN",
  "IDEMPOTENCY_MISMATCH",
  "INVALID_INPUT",
  "INVALID_TRANSITION",
  "NO_ACTIVE_SEASON",
  "NOT_FOUND",
  "PLAYER_REQUIRED",
  "PRECONDITION_FAILED",
  "SESSION_STALE",
] as const;

export type SeasonServiceErrorCode = (typeof SEASON_SERVICE_ERROR_CODES)[number];

export class SeasonServiceError extends Error {
  constructor(
    readonly code: SeasonServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SeasonServiceError";
  }
}
