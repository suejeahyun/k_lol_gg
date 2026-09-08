import type {
  AdminMatchView,
  AdminMatchTeamBalanceSource,
  AdminMatchImportInput,
  AdminSubmissionView,
  MatchGameInput,
  MatchRecordInput,
  MatchSeriesStatus,
  MatchSubmissionCreateInput,
  MatchSubmissionUpdateInput,
  MatchSubmissionStatus,
  MatchSubmissionView,
  OwnSubmissionPage,
  PublicMatchDetail,
  PublicMatchPage,
} from "../../domain/match";

export type MatchActor = Readonly<{
  userAccountId: string;
  sessionId: string;
}> & (
  | Readonly<{ purpose: "ACCOUNT"; requiredRole: "USER" }>
  | Readonly<{ purpose: "ADMIN"; requiredRole: "ADMIN" }>
);

export type MatchCommandEnvelope = Readonly<{
  actor: MatchActor;
  requestId: string;
  scope: string;
  keyHash: Buffer;
  requestHash: Buffer;
}>;

export type MatchMutationResult<T extends Record<string, unknown>> = Readonly<{
  body: T;
  status: number;
  revision?: number;
  replayed: boolean;
}>;

export type PublicMatchQuery = Readonly<{
  query?: string;
  seasonId?: string;
  winner?: "BLUE" | "RED" | "TIE";
  from?: string;
  to?: string;
  sort: "playedOn" | "title";
  order: "asc" | "desc";
  cursor?:
    | Readonly<{
        sort: "playedOn";
        order: "asc" | "desc";
        playedOn: string;
        startedAt: string | null;
        id: string;
        filterFingerprint: string;
      }>
    | Readonly<{
        sort: "title";
        order: "asc" | "desc";
        titleNormalized: string;
        id: string;
        filterFingerprint: string;
      }>;
  page: number;
  pageSize: number;
}>;

export type AdminMatchQuery = Readonly<{
  view: "matches" | "submissions";
  query?: string;
  season?: string | "UNASSIGNED";
  matchStatus?: MatchSeriesStatus;
  submissionStatus?: MatchSubmissionStatus;
  page: number;
  pageSize: number;
}>;

export type AdminMatchWorkspace = Readonly<{
  matches: readonly AdminMatchView[];
  submissions: readonly AdminSubmissionView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

export type AdminMatchEditorCatalog = Readonly<{
  seasons: readonly Readonly<{
    id: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "ENDED" | "RETIRED";
  }>[];
  players: readonly Readonly<{
    id: string;
    nickname: string;
    tagLine: string;
    status: "ACTIVE" | "INACTIVE";
  }>[];
  champions: readonly Readonly<{
    key: string;
    displayName: string;
    status: "ACTIVE" | "INACTIVE";
  }>[];
}>;

export type MatchSummaryIntegrity = Readonly<{
  ok: boolean;
  checkedCount: number;
  nextAfter: string | null;
  sampleTruncated: boolean;
  samples: readonly Readonly<{
    matchId: string;
    stored: Readonly<{ gameCount: number; blueWins: number; redWins: number }>;
    actual: Readonly<{ gameCount: number; blueWins: number; redWins: number }>;
  }>[];
}>;

export type OwnSubmissionQuery = Readonly<{
  status?: MatchSubmissionStatus;
  cursor?: Readonly<{ updatedAt: string; id: string }>;
  pageSize: number;
}>;

export type PrivateImageAttachmentInput = Readonly<{
  reservationId: string;
  submissionId: string;
  expectedRevision: number;
  gameNumber: number;
  storageProvider: string;
  storageKey: string;
  originalFileName: string | null;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: Buffer;
  ingestSource: "WEB_USER" | "ADMIN" | "KAKAO_SERVICE" | "JOB";
  ocrResult:
    | Readonly<{ status: "SUCCEEDED"; candidate: Record<string, unknown> }>
    | Readonly<{ status: "FAILED"; errorCode: string }>;
}>;

export type PrivateImageOcrResult = PrivateImageAttachmentInput["ocrResult"];

export type PrivateImageOcrReservationInput = Readonly<{
  submissionId: string;
  imageId: string;
  expectedRevision: number;
  accountRateLimitKeyHash: Buffer;
}>;

export type PrivateImageOcrReservationResult =
  | Readonly<{
      kind: "RESERVED";
      reservationId: string;
      expiresAt: string;
      gameNumber: number;
      reference: PrivateImageReadReference;
    }>
  | Readonly<{
      kind: "REPLAY";
      result: MatchMutationResult<Record<string, unknown>>;
    }>;

export type PrivateImageUploadReservationInput = Readonly<{
  submissionId: string;
  expectedRevision: number;
  gameNumber: number;
  declaredContentType: "image/png" | "image/jpeg" | "image/webp";
  declaredByteSize: number;
  declaredSha256: Buffer;
  storageProvider: string;
  storageKey: string;
  accountRateLimitKeyHash: Buffer;
  networkRateLimitKeyHash: Buffer;
}>;

export type PrivateImageUploadReservationResult =
  | Readonly<{
      kind: "RESERVED";
      reservationId: string;
      expiresAt: string;
      storageProvider: string;
      storageKey: string;
    }>
  | Readonly<{
      kind: "REPLAY";
      result: MatchMutationResult<Record<string, unknown>>;
    }>;

export type SubmissionReviewDraftInput = Readonly<{
  submissionId: string;
  expectedRevision: number;
  seasonId: string;
  reviewedResult: Record<string, unknown>;
}>;

export type PrivateImageReadReference = Readonly<{
  storageProvider: string;
  storageKey: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
  sha256: Buffer;
}>;

export interface MatchRepository {
  listPublic(query: PublicMatchQuery): Promise<PublicMatchPage>;
  getPublic(matchId: string): Promise<PublicMatchDetail | null>;
  getPublicIdByLegacyId(legacyId: number): Promise<string | null>;
  listOwnSubmissions(actorUserAccountId: string, query: OwnSubmissionQuery): Promise<OwnSubmissionPage>;
  getOwnSubmission(actorUserAccountId: string, submissionId: string): Promise<MatchSubmissionView | null>;
  getOwnSubmissionByPublicCode(
    actorUserAccountId: string,
    publicCode: string,
  ): Promise<MatchSubmissionView | null>;
  getAdminWorkspace(query: AdminMatchQuery): Promise<AdminMatchWorkspace>;
  getAdminEditorCatalog(includePlayerIds?: readonly string[]): Promise<AdminMatchEditorCatalog>;
  searchAdminPlayerOptions(
    query: string,
    includePlayerIds?: readonly string[],
  ): Promise<AdminMatchEditorCatalog["players"]>;
  getMatchSummaryIntegrity(after: string | null, pageSize: number): Promise<MatchSummaryIntegrity>;
  getAdminMatch(matchId: string): Promise<(AdminMatchView & { games: readonly MatchGameInput[] }) | null>;
  getAdminSubmission(submissionId: string): Promise<AdminSubmissionView | null>;
  getOwnPrivateImage(
    actorUserAccountId: string,
    submissionId: string,
    imageId: string,
  ): Promise<PrivateImageReadReference | null>;
  getAdminPrivateImage(
    submissionId: string,
    imageId: string,
  ): Promise<PrivateImageReadReference | null>;
  createMatch(
    envelope: MatchCommandEnvelope,
    input: MatchRecordInput,
    now: Date,
    teamBalanceSource?: AdminMatchTeamBalanceSource | null,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  updateMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    input: MatchRecordInput,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  publishMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  voidMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    reason: string,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  restoreMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  createSubmission(
    envelope: MatchCommandEnvelope,
    input: MatchSubmissionCreateInput,
    sourceReferenceHash: Buffer,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  createAdminImport(
    envelope: MatchCommandEnvelope,
    input: AdminMatchImportInput,
    sourceReferenceHash: Buffer,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  updateSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    input: MatchSubmissionUpdateInput,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  cancelSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  reservePrivateImageUpload(
    envelope: MatchCommandEnvelope,
    input: PrivateImageUploadReservationInput,
    now: Date,
  ): Promise<PrivateImageUploadReservationResult>;
  finalizePrivateImageUpload(
    envelope: MatchCommandEnvelope,
    input: PrivateImageAttachmentInput,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  cancelPrivateImageUpload(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    now: Date,
  ): Promise<void>;
  markPrivateImageUploadStaged(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    now: Date,
  ): Promise<void>;
  requestPrivateImageUploadCleanup(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    failureCode: string,
    now: Date,
  ): Promise<void>;
  confirmPrivateImageUploadDeleted(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    now: Date,
  ): Promise<void>;
  reservePrivateImageOcr(
    envelope: MatchCommandEnvelope,
    input: PrivateImageOcrReservationInput,
    now: Date,
  ): Promise<PrivateImageOcrReservationResult>;
  finalizePrivateImageOcr(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    ocrResult: PrivateImageOcrResult,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  failPrivateImageOcr(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    failureCode: string,
    now: Date,
  ): Promise<void>;
  saveSubmissionReviewDraft(
    envelope: MatchCommandEnvelope,
    input: SubmissionReviewDraftInput,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  approveSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    reviewedGames: readonly MatchGameInput[],
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  rejectSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    reason: string,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
  reopenSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MatchMutationResult<Record<string, unknown>>>;
}
