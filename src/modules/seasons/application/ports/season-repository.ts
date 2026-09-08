import type { DatabaseExecutor } from "@/platform/db/transaction";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type {
  AdminSeasonWorkspace,
  AdminSeasonKakaoPendingDetail,
  AdminSeasonKakaoPendingPage,
  ApplicationHub,
  ConfirmedSeasonTeamBalanceRoster,
  OwnSeasonApplication,
  PublicSeason,
  SeasonApplicationPosition,
  SeasonApplicationStatus,
} from "../../domain/season";

export type CommandEnvelope = Readonly<{
  actorUserAccountId: string;
  actorSession: TransactionSessionActor;
  authorization: "ADMIN_MUTATION" | "SUPER_ADMIN_MUTATION" | "APPROVED_ACCOUNT_MUTATION";
  requestId: string;
  scope: string;
  keyHash: Buffer;
  requestHash: Buffer;
}>;

export type MutationResult<T extends Record<string, unknown>> = Readonly<{
  body: T;
  status: number;
  revision?: number;
  replayed: boolean;
}>;

export type CreateSeasonInput = Readonly<{
  name: string;
  applicationsOpenAt: Date | null;
  applicationsCloseAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
}>;

export type UpdateSeasonInput = CreateSeasonInput & Readonly<{ id: string; expectedRevision: number }>;

export type UpsertOwnApplicationInput = Readonly<{
  actorUserAccountId: string;
  applyDate: string;
  recruitNo: number;
  expectedRevision: number;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
}>;

export type ReviewApplicationInput = Readonly<{
  id: string;
  expectedRevision: number;
  status: Exclude<SeasonApplicationStatus, "APPLIED" | "CANCELLED">;
  reviewNote: string | null;
}>;

export type AdminWorkspaceQuery = Readonly<{
  seasonId?: string;
  status?: SeasonApplicationStatus;
  source?: "SITE" | "KAKAO";
  query?: string;
  page: number;
  pageSize: number;
}>;

export type AdminKakaoPendingQuery = Readonly<{
  seasonId?: string;
  applyDate?: string;
  recruitNo?: number;
  matchState?: "MATCHED_RESERVE" | "UNMATCHED" | "AMBIGUOUS";
  status?: "ACTIVE" | "CANCELLED" | "RESOLVED";
  query?: string;
  page: number;
  pageSize: number;
}>;

export type ResolveKakaoPendingInput = Readonly<{
  id: string;
  expectedRevision: number;
  playerId: string;
  applicationStatus: "APPLIED" | "RESERVE";
}>;

export interface SeasonAuditWriter {
  append(
    executor: DatabaseExecutor,
    event: Readonly<{
      requestId: string;
      actorUserAccountId: string;
      action: string;
      targetType: "SEASON" | "SEASON_APPLICATION" | "SEASON_KAKAO_PENDING_APPLICATION";
      targetId: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void>;
}

export interface SeasonRepository {
  listPublicSeasons(now: Date): Promise<readonly PublicSeason[]>;
  getCurrentSeason(now: Date): Promise<PublicSeason | null>;
  getApplicationHub(actorUserAccountId: string | null, now: Date, recruitNo: number): Promise<ApplicationHub>;
  getAdminWorkspace(query: AdminWorkspaceQuery): Promise<AdminSeasonWorkspace>;
  getKakaoPendingApplications(query: AdminKakaoPendingQuery): Promise<AdminSeasonKakaoPendingPage>;
  getKakaoPendingApplication(id: string, candidateQuery: string): Promise<AdminSeasonKakaoPendingDetail>;
  getConfirmedApplicationsForTeamBalance(
    seasonId: string,
    applyDate: string,
    recruitNo: number,
  ): Promise<ConfirmedSeasonTeamBalanceRoster>;
  createSeason(
    envelope: CommandEnvelope,
    input: CreateSeasonInput,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  updateSeason(
    envelope: CommandEnvelope,
    input: UpdateSeasonInput,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  activateSeason(
    envelope: CommandEnvelope,
    id: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  endSeason(
    envelope: CommandEnvelope,
    id: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  cloneSeason(
    envelope: CommandEnvelope,
    id: string,
    name: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  retireSeason(
    envelope: CommandEnvelope,
    id: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  upsertOwnApplication(
    envelope: CommandEnvelope,
    input: UpsertOwnApplicationInput,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  cancelOwnApplication(
    envelope: CommandEnvelope,
    expectedRevision: number,
    applyDate: string,
    recruitNo: number,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  reviewApplication(
    envelope: CommandEnvelope,
    input: ReviewApplicationInput,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  resolveKakaoPendingApplication(
    envelope: CommandEnvelope,
    input: ResolveKakaoPendingInput,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  cancelKakaoPendingApplication(
    envelope: CommandEnvelope,
    id: string,
    expectedRevision: number,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  findOwnApplication(
    actorUserAccountId: string,
    now: Date,
    recruitNo: number,
  ): Promise<OwnSeasonApplication | null>;
}
