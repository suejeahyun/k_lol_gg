import type { TeamBalanceCalculation } from "@/modules/team-tools";

import type {
  CompetitionAuditEvent,
  CompetitionCommandReceipt,
  CompetitionOutboxEvent,
  JsonObject,
} from "../../core";
import type { EventAggregate, EventTeamBalanceParticipant } from "../domain/event";
import type { EventCommand, EventOwnerAuthorizationIntent, EventAdminAuthorizationIntent } from "./event-command";

export interface EventTransactionContext {
  readonly eventTransaction: unique symbol;
}

export interface EventUnitOfWork {
  /** All callbacks run in one rollback-capable serializable database transaction. */
  transaction<T>(operation: (transaction: EventTransactionContext) => Promise<T>): Promise<T>;
}

export interface EventRepository {
  loadForUpdate(transaction: EventTransactionContext, eventId: string): Promise<EventAggregate | null>;
  assertPublishedReadyGallery(transaction: EventTransactionContext, galleryId: string): Promise<void>;
  save(
    transaction: EventTransactionContext,
    input: Readonly<{
      aggregate: EventAggregate;
      expectedRevision: number;
      create: boolean;
    }>,
  ): Promise<void>;
}

export interface EventAuthorizationPort {
  /** Must re-read session/authVersion, role, TOTP purpose, and ownership in this transaction. */
  recheck(
    transaction: EventTransactionContext,
    input: Readonly<{
      actor: EventCommand["metadata"]["actor"];
      intent: EventOwnerAuthorizationIntent | EventAdminAuthorizationIntent;
      eventId: string;
    }>,
  ): Promise<void>;
}

export type EventReceiptClaim =
  | Readonly<{ kind: "CLAIMED" }>
  | Readonly<{ kind: "MISMATCH" }>
  | Readonly<{
      kind: "REPLAY";
      receipt: CompetitionCommandReceipt<EventMutationBody>;
    }>;

export interface EventCommandReceiptPort {
  /** Claims (actor, scope, keyHash), compares fingerprint, and replays only unexpired rows under lock. */
  claim(
    transaction: EventTransactionContext,
    command: EventCommand,
  ): Promise<EventReceiptClaim>;
  complete(
    transaction: EventTransactionContext,
    receipt: CompetitionCommandReceipt<EventMutationBody>,
  ): Promise<void>;
}

export interface EventAuditPort {
  append(transaction: EventTransactionContext, event: CompetitionAuditEvent): Promise<void>;
}

export interface EventOutboxPort {
  append(transaction: EventTransactionContext, event: CompetitionOutboxEvent): Promise<void>;
}

export interface EventTeamBalancePort {
  /** Adapter enriches ratings and delegates to the S06 team-balance contract. */
  calculate(
    input: Readonly<{
      transaction: EventTransactionContext;
      eventId: string;
      participants: readonly EventTeamBalanceParticipant[];
    }>,
  ): Promise<TeamBalanceCalculation>;
}

export interface EventClockPort {
  now(): string;
  receiptExpiresAt(now: string): string;
}

export type EventMutationBody = JsonObject & Readonly<{
  eventId: string;
  revision: number;
  status: EventAggregate["lifecycle"]["status"];
  commandType: EventCommand["type"];
  correctionPlan?: JsonObject;
}>;

export type EventMutationResult = Readonly<{
  body: EventMutationBody;
  revision: number;
  replayed: boolean;
}>;
