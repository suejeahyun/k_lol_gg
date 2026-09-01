import type { DatabaseExecutor } from "@/platform/db/transaction";

import type {
  AdminSeasonWorkspace,
  ApplicationHub,
  OwnSeasonApplication,
  PublicSeason,
  SeasonApplicationPosition,
  SeasonApplicationStatus,
} from "../../domain/season";

export type CommandEnvelope = Readonly<{
  actorUserAccountId: string;
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

export interface SeasonAuditWriter {
  append(
    executor: DatabaseExecutor,
    event: Readonly<{
      requestId: string;
      actorUserAccountId: string;
      action: string;
      targetType: "SEASON" | "SEASON_APPLICATION";
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
  getApplicationHub(actorUserAccountId: string | null, now: Date): Promise<ApplicationHub>;
  getAdminWorkspace(query: AdminWorkspaceQuery): Promise<AdminSeasonWorkspace>;
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
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  reviewApplication(
    envelope: CommandEnvelope,
    input: ReviewApplicationInput,
    now: Date,
  ): Promise<MutationResult<Record<string, unknown>>>;
  findOwnApplication(
    actorUserAccountId: string,
    now: Date,
  ): Promise<OwnSeasonApplication | null>;
}
