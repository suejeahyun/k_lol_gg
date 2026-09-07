import type { JsonObject } from "@/modules/competitions/core";

import type { Champion } from "../domain/champion";
import type { ChampionCommand } from "./commands";

export interface ChampionTransaction {
  readonly championTransaction: unique symbol;
}

export interface ChampionUnitOfWork {
  transaction<T>(operation: (transaction: ChampionTransaction) => Promise<T>): Promise<T>;
}

export interface ChampionAuthorizationPort {
  /** Rechecks the ADMIN-purpose session, approval, role and TOTP inside the transaction. */
  recheck(transaction: ChampionTransaction, command: ChampionCommand): Promise<Readonly<{
    principalId: string;
    userAccountId: string;
    role: "ADMIN" | "SUPER_ADMIN";
  }> | null>;
}

export interface ChampionRepository {
  loadForUpdate(transaction: ChampionTransaction, key: string): Promise<Champion | null>;
  insert(transaction: ChampionTransaction, champion: Champion): Promise<void>;
  save(transaction: ChampionTransaction, champion: Champion, expectedRevision: number): Promise<void>;
}

export type ChampionMutationBody = JsonObject & Readonly<{
  key: string;
  displayName: string;
  status: string;
  revision: number;
}>;

export type ChampionReceipt = Readonly<{
  actorPrincipalId: string;
  scope: string;
  keyHash: Uint8Array;
  requestHash: Uint8Array;
  bodyDigestHex: string;
  body: ChampionMutationBody;
  responseStatus: 200 | 201;
  createdAt: string;
  expiresAt: string;
}>;

export type ChampionReceiptClaim =
  | Readonly<{ kind: "CLAIMED" }>
  | Readonly<{ kind: "MISMATCH" }>
  | Readonly<{ kind: "REPLAY"; receipt: ChampionReceipt }>;

export interface ChampionReceiptPort {
  claim(transaction: ChampionTransaction, command: ChampionCommand): Promise<ChampionReceiptClaim>;
  complete(transaction: ChampionTransaction, receipt: ChampionReceipt): Promise<void>;
}

export interface ChampionAuditPort {
  append(transaction: ChampionTransaction, event: Readonly<{
    requestId: string;
    actorUserAccountId: string;
    action: ChampionCommand["type"];
    championKey: string;
    before: JsonObject | null;
    after: JsonObject;
    occurredAt: string;
  }>): Promise<void>;
}

export interface ChampionOutboxPort {
  append(transaction: ChampionTransaction, event: Readonly<{
    id: string;
    requestId: string;
    championKey: string;
    revision: number;
    eventType: ChampionCommand["type"];
    dedupeKey: string;
    payload: JsonObject;
    occurredAt: string;
  }>): Promise<void>;
}

export interface ChampionClockPort {
  now(): Date;
  receiptExpiresAt(now: Date): Date;
}

export type ChampionCommandResult = Readonly<{
  body: ChampionMutationBody;
  revision: number;
  status: 200 | 201;
  replayed: boolean;
}>;
