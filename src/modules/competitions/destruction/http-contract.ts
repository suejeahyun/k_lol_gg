import { createHash } from "node:crypto";

import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import type { CompetitionPosition, JsonObject } from "../core";
import type { CompetitionPlayerOption } from "../core";
import { DESTRUCTION_PRELIMINARY_FORMATS, type DestructionConfiguration, type DestructionPreliminaryFormat } from "./configuration";
import type { DestructionApplicationStatus } from "./recruitment";
import type { DestructionAggregate, DestructionPublicDto } from "./state";

export const DESTRUCTION_PUBLIC_STATUSES = [
  "PLANNED",
  "RECRUITING",
  "TEAM_BUILDING",
  "AUCTION",
  "PRELIMINARY",
  "TOURNAMENT",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly DestructionAggregate["lifecycle"]["status"][];

export type DestructionListQuery = Readonly<{
  query: string;
  status: DestructionAggregate["lifecycle"]["status"] | null;
  format: DestructionPreliminaryFormat | null;
  page: number;
  pageSize: 12 | 24 | 48;
}>;

export type DestructionListItemDto = DestructionPublicDto & Readonly<{
  participantCount: number;
}>;

export type DestructionPage = Readonly<{
  items: readonly DestructionListItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

export type DestructionAdminWorkspace = Readonly<{
  destruction: DestructionAggregate;
  playerOptions: readonly CompetitionPlayerOption[];
  playerLabels: Readonly<Record<string, string>>;
}>;

export type OwnDestructionApplicationDto = Readonly<{
  applicationId: string;
  tournamentId: string;
  tournamentRevision: number;
  playerId: string;
  position: CompetitionPosition;
  status: DestructionApplicationStatus;
}>;

export type OwnDestructionMvpBallotDto = Readonly<{
  fixtureId: string;
  fixtureName: string;
  candidates: readonly Readonly<{ playerId: string; playerName: string }>[];
}>;

export interface DestructionQueryPort {
  listPublic(query: DestructionListQuery): Promise<DestructionPage>;
  getPublic(tournamentId: string): Promise<DestructionPublicDto | null>;
  getOwnApplication(tournamentId: string, ownerUserAccountId: string): Promise<OwnDestructionApplicationDto | null>;
  getOwnMvpBallots(tournamentId: string, ownerUserAccountId: string): Promise<readonly OwnDestructionMvpBallotDto[]>;
  getOwnedPlayerId(ownerUserAccountId: string): Promise<string | null>;
  listAdmin(query: DestructionListQuery): Promise<DestructionPage>;
  getAdmin(tournamentId: string): Promise<DestructionAggregate | null>;
  getAdminWorkspace(tournamentId: string): Promise<DestructionAdminWorkspace | null>;
}

const LIST_QUERY_KEYS = new Set(["q", "status", "format", "page", "pageSize"]);

export function parseDestructionListQuery(input: string): DestructionListQuery | null {
  const url = new URL(input);
  if ([...url.searchParams.keys()].some((key) => !LIST_QUERY_KEYS.has(key))) return null;
  for (const key of LIST_QUERY_KEYS) if (url.searchParams.getAll(key).length > 1) return null;
  const query = (url.searchParams.get("q") ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
  const status = url.searchParams.get("status");
  const format = url.searchParams.get("format");
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "12");
  if (
    query.length > 64 || /[\u0000-\u001f\u007f-\u009f]/u.test(query) ||
    (status !== null && !DESTRUCTION_PUBLIC_STATUSES.includes(status as never)) ||
    (format !== null && !DESTRUCTION_PRELIMINARY_FORMATS.includes(format as never)) ||
    !Number.isSafeInteger(page) || page < 1 || page > 10_000 ||
    ![12, 24, 48].includes(pageSize)
  ) return null;
  return {
    query,
    status: status as DestructionListQuery["status"],
    format: format as DestructionListQuery["format"],
    page,
    pageSize: pageSize as DestructionListQuery["pageSize"],
  };
}

export type DestructionOwnerAuthorizationIntent = Readonly<{
  kind: "APPROVED_OWNER";
  ownerUserAccountId: string;
  playerId: string;
  requireApprovedAccount: true;
  requireOwnership: true;
  transactionRecheck: true;
}>;

export type DestructionAdminAuthorizationIntent = Readonly<{
  kind: "ADMIN_TOTP";
  minimumRole: "ADMIN" | "SUPER_ADMIN";
  requireTotp: true;
  transactionRecheck: true;
}>;

type CommandMetadata<TAuthorization> = Readonly<{
  actor: TransactionSessionActor;
  authorizationIntent: TAuthorization;
  requestId: string;
  expectedRevision: number;
  idempotency: Readonly<{ scope: string; keyHash: Uint8Array; requestFingerprint: Uint8Array }>;
  issuedAt: string;
}>;

type OwnerCommand<Type extends string, Payload> = Readonly<{
  type: Type;
  tournamentId: string;
  metadata: CommandMetadata<DestructionOwnerAuthorizationIntent>;
  payload: Payload;
}>;

type AdminCommand<Type extends string, Payload> = Readonly<{
  type: Type;
  tournamentId: string;
  metadata: CommandMetadata<DestructionAdminAuthorizationIntent>;
  payload: Payload;
}>;

export type DestructionOwnerCommand =
  | OwnerCommand<"UPSERT_OWN_APPLICATION", Readonly<{ applicationId: string; playerId: string; position: CompetitionPosition }>>
  | OwnerCommand<"CANCEL_OWN_APPLICATION", Readonly<{ playerId: string }>>
  | OwnerCommand<"CAST_MVP_VOTE", Readonly<{ fixtureId: string; voterPlayerId: string; candidatePlayerId: string }>>;

type ResultPayload = Readonly<{ fixtureId: string; teamAScore: number; teamBScore: number; winnerTeamId: string }>;

export type DestructionAdminCommand =
  | AdminCommand<"CREATE_DESTRUCTION", Readonly<{ title: string; configuration: DestructionConfiguration }>>
  | AdminCommand<"START_RECRUITMENT", Readonly<Record<string, never>>>
  | AdminCommand<"SET_APPLICATION_STATUS", Readonly<{ applicationId: string; status: Exclude<DestructionApplicationStatus, "APPLIED" | "CANCELLED"> }>>
  | AdminCommand<"CLOSE_RECRUITMENT", Readonly<Record<string, never>>>
  | AdminCommand<"CONFIRM_TEAMS", Readonly<{ seed: string; captains: readonly Readonly<{ teamId: string; name: string; participantId: string; baselineValue: number }>[] }>>
  | AdminCommand<"START_AUCTION", Readonly<Record<string, never>>>
  | AdminCommand<"DRAW_AUCTION", Readonly<Record<string, never>>>
  | AdminCommand<"HOLD_AUCTION", Readonly<{ participantId: string }>>
  | AdminCommand<"SELL_AUCTION", Readonly<{ participantId: string; teamId: string; purchasePoints: number }>>
  | AdminCommand<"PUBLISH_PRELIMINARY", Readonly<Record<string, never>>>
  | AdminCommand<"RECORD_PRELIMINARY_RESULT", ResultPayload>
  | AdminCommand<"CORRECT_PRELIMINARY_RESULT", ResultPayload>
  | AdminCommand<"PUBLISH_TOURNAMENT", Readonly<Record<string, never>>>
  | AdminCommand<"RECORD_TOURNAMENT_RESULT", ResultPayload>
  | AdminCommand<"CORRECT_TOURNAMENT_RESULT", ResultPayload>
  | AdminCommand<"REPLACE_PARTICIPANT", Readonly<{ replacementId: string; participantId: string; incomingPlayerId: string; incomingPosition: CompetitionPosition; reason: string }>>
  | AdminCommand<"RESET_MVP", Readonly<{ fixtureId: string }>>
  | AdminCommand<"ASSIGN_MVP", Readonly<{ fixtureId: string; playerId: string }>>
  | AdminCommand<"COMPLETE_DESTRUCTION", Readonly<Record<string, never>>>
  | AdminCommand<"CANCEL_DESTRUCTION", Readonly<{ reason: string }>>
  | AdminCommand<"RESTORE_DESTRUCTION", Readonly<Record<string, never>>>;

export type DestructionHttpCommand = DestructionOwnerCommand | DestructionAdminCommand;

export type DestructionHttpMutationBody = JsonObject & Readonly<{
  tournamentId: string;
  revision: number;
  status: DestructionAggregate["lifecycle"]["status"];
  commandType: DestructionHttpCommand["type"];
}>;

export type DestructionMutationResult = Readonly<{
  body: DestructionHttpMutationBody;
  revision: number;
  replayed: boolean;
}>;

export interface DestructionCommandExecutor {
  /** Adapter must authorize, claim the receipt, mutate, audit, enqueue and complete the receipt in one transaction. */
  handle(command: DestructionHttpCommand): Promise<DestructionMutationResult>;
}

export type DestructionCommandContext = Readonly<{
  actorSession: TransactionSessionActor;
  purpose: "ACCOUNT" | "ADMIN";
  requestId: string;
  idempotencyMaterial: Uint8Array;
}>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

/** Raw idempotency keys and session secrets never enter commands or fingerprints. */
export function destructionCommandRequestFingerprint(command: DestructionHttpCommand): Uint8Array {
  return createHash("sha256").update(command.metadata.idempotency.scope).update("\0").update(canonicalJson({
    type: command.type,
    tournamentId: command.tournamentId,
    expectedRevision: command.metadata.expectedRevision,
    payload: command.payload,
  })).digest();
}

export function destructionAdminMinimumRole(type: DestructionAdminCommand["type"]): "ADMIN" | "SUPER_ADMIN" {
  return [
    "CORRECT_PRELIMINARY_RESULT",
    "CORRECT_TOURNAMENT_RESULT",
    "REPLACE_PARTICIPANT",
    "RESET_MVP",
    "ASSIGN_MVP",
    "RESTORE_DESTRUCTION",
  ].includes(type) ? "SUPER_ADMIN" : "ADMIN";
}
