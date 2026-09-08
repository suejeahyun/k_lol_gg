import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type { TeamBalanceEligibility, TeamBalanceLayoutEntry } from "../../domain/team-balance";
import type {
  TeamBalanceDraft,
  TeamBalanceDraftAuthorization,
  TeamBalanceDraftCatalog,
} from "../../domain/team-balance-draft";

export type TeamBalanceCommandEnvelope = Readonly<{
  actorUserAccountId: string;
  actorSession: TransactionSessionActor;
  authorization: TeamBalanceDraftAuthorization;
  requestId: string;
  scope: string;
  keyHash: Buffer;
  requestHash: Buffer;
}>;

export type TeamBalanceMutationResult = Readonly<{
  body: Record<string, unknown>;
  status: number;
  revision: number;
  replayed: boolean;
}>;

export type CreateTeamBalanceDraftInput = Readonly<{
  title: string;
  participants: readonly Readonly<{
    playerId: string;
    eligiblePositions: readonly TeamBalanceEligibility[];
  }>[];
}>;

export type SelectTeamBalanceCandidateInput =
  | Readonly<{ kind: "AUTO"; rank: 1 | 2 | 3 }>
  | Readonly<{ kind: "MANUAL"; layout: readonly TeamBalanceLayoutEntry[] }>;

export type TeamBalanceViewer = Readonly<{
  actorUserAccountId: string;
  authorization: "OWNER" | "ADMIN";
}>;

export type TeamBalanceDraftListQuery = Readonly<{
  page: number;
  pageSize: number;
}>;

export interface TeamBalanceRepository {
  createDraft(
    envelope: TeamBalanceCommandEnvelope,
    input: CreateTeamBalanceDraftInput,
    now: Date,
  ): Promise<TeamBalanceMutationResult>;
  listDrafts(
    viewer: TeamBalanceViewer,
    query: TeamBalanceDraftListQuery,
  ): Promise<TeamBalanceDraftCatalog>;
  getDraft(viewer: TeamBalanceViewer, draftId: string): Promise<TeamBalanceDraft | null>;
  selectCandidate(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    input: SelectTeamBalanceCandidateInput,
    now: Date,
  ): Promise<TeamBalanceMutationResult>;
  saveDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<TeamBalanceMutationResult>;
  reevaluateDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<TeamBalanceMutationResult>;
  archiveDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<TeamBalanceMutationResult>;
  restoreDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ): Promise<TeamBalanceMutationResult>;
}
