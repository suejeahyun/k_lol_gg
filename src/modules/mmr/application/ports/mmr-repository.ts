import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type { MmrPosition } from "../../domain/mmr-projection";

export type MmrProjectionSummary = Readonly<{
  status: "EMPTY" | "READY";
  generation: number;
  formulaVersion: string | null;
  sourceMatchCount: number;
  sourceGameCount: number;
  sourceAdjustmentCount: number;
  pendingSourceCount: number;
  calculatedAt: string | null;
}>;

export type MmrPlayerListItem = Readonly<{
  playerId: string;
  displayName: string;
  riotId: string;
  overallScore: number;
  confidence: number;
  sampleSize: number;
  positions: Readonly<Record<MmrPosition, Readonly<{ score: number; sampleSize: number }>>>;
}>;

export type MmrAdjustmentReview = Readonly<{
  id: string;
  playerId: string;
  playerDisplayName: string;
  position: MmrPosition | null;
  deltaBp: number;
  reasonCode: string;
  publicNote: string;
  actorUserAccountId: string;
  createdAt: string;
}>;

export type MmrPage<T> = Readonly<{
  items: readonly T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

export type MmrPlayerQuery = Readonly<{
  query: string;
  position: MmrPosition | null;
  page: number;
  pageSize: number;
}>;

export type MmrCommandEnvelope = Readonly<{
  actorSession: TransactionSessionActor;
  requestId: string;
  scope: string;
  keyHash: Buffer;
  requestHash: Buffer;
}>;

export type MmrMutationResult = Readonly<{
  body: Record<string, unknown>;
  status: number;
  revision: number;
  replayed: boolean;
}>;

export type MmrAdjustmentInput = Readonly<{
  playerId: string;
  position: MmrPosition | null;
  deltaBp: number;
  reasonCode: string;
  publicNote: string;
}>;

export type MmrCatchUpResult =
  | Readonly<{ kind: "IDLE"; generation: number }>
  | Readonly<{ kind: "REBUILT"; generation: number; consumedEventCount: number }>;

export interface MmrRepository {
  getSummary(): Promise<MmrProjectionSummary>;
  listPlayers(query: MmrPlayerQuery): Promise<MmrPage<MmrPlayerListItem>>;
  getPlayer(playerId: string): Promise<MmrPlayerListItem | null>;
  listAdjustments(page: number, pageSize: number): Promise<MmrPage<MmrAdjustmentReview>>;
  recalculate(envelope: MmrCommandEnvelope, expectedGeneration: number, now: Date): Promise<MmrMutationResult>;
  addAdjustment(
    envelope: MmrCommandEnvelope,
    expectedGeneration: number,
    input: MmrAdjustmentInput,
    now: Date,
  ): Promise<MmrMutationResult>;
  catchUp(now: Date): Promise<MmrCatchUpResult>;
}
