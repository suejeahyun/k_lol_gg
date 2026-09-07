import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";

import type {
  PrivateAssetBinding,
  PrivateAssetInspection,
  PrivateAssetListQuery,
  PrivateAssetPurpose,
  PrivateAssetRecord,
  PrivateAssetResourceType,
} from "../../domain/private-asset";
import type {
  PrivateAssetActor,
  PrivateAssetResourceBinding,
} from "../private-asset-policy";

export type PrivateAssetTransaction = Readonly<{ transactionId: string }>;

export interface PrivateAssetUnitOfWork {
  transaction<T>(work: (transaction: PrivateAssetTransaction) => Promise<T>): Promise<T>;
}

export interface PrivateAssetAuthorizationPort {
  /** Rechecks session, role, approval, and TOTP-bound admin purpose inside the transaction. */
  recheck<TActor extends PrivateAssetActor>(
    transaction: PrivateAssetTransaction,
    actor: TActor,
  ): Promise<TActor | null>;
}

export interface PrivateAssetRepository {
  resolveResourceForUpdate(
    transaction: PrivateAssetTransaction,
    resource: Readonly<{ resourceType: PrivateAssetResourceType; resourceId: string }>,
  ): Promise<PrivateAssetResourceBinding | null>;
  /** Must serialize the resource/purpose/digest tuple so concurrent inserts cannot both win. */
  findDuplicateForUpdate(
    transaction: PrivateAssetTransaction,
    input: Readonly<{
      resourceType: PrivateAssetResourceType;
      resourceId: string;
      purpose: PrivateAssetPurpose;
      sha256: Uint8Array;
    }>,
  ): Promise<PrivateAssetBinding | null>;
  insertStaged(
    transaction: PrivateAssetTransaction,
    binding: PrivateAssetBinding,
  ): Promise<void>;
  findByIdForUpdate(
    transaction: PrivateAssetTransaction,
    assetId: string,
  ): Promise<PrivateAssetBinding | null>;
  updateLifecycle(
    transaction: PrivateAssetTransaction,
    asset: PrivateAssetRecord,
  ): Promise<void>;
  list(
    transaction: PrivateAssetTransaction,
    query: PrivateAssetListQuery,
    allowedPurposes: readonly PrivateAssetPurpose[],
  ): Promise<Readonly<{ items: readonly PrivateAssetBinding[]; nextCursor: string | null }>>;
  /** Excludes tombstones that already have a successful cleanup outcome. */
  listCleanupCandidates(
    transaction: PrivateAssetTransaction,
    limit: number,
  ): Promise<readonly PrivateAssetRecord[]>;
  /** Locks abandoned STAGED bindings older than `before`; adapters should use SKIP LOCKED. */
  listStaleStagedCandidates(
    transaction: PrivateAssetTransaction,
    before: string,
    limit: number,
  ): Promise<readonly PrivateAssetBinding[]>;
  recordCleanupOutcome(
    transaction: PrivateAssetTransaction,
    outcome: Readonly<{
      assetId: string;
      attemptedAt: string;
      succeeded: boolean;
      failureCode: "STORAGE_UNAVAILABLE" | null;
    }>,
  ): Promise<void>;
}

export type PrivateAssetAuditEvent = Readonly<{
  eventId: string;
  assetId: string;
  actorPurpose: PrivateAssetActor["purpose"] | "SYSTEM";
  actorUserAccountId: string | null;
  action: "STAGED" | "READY" | "DELETE_REQUESTED" | "STAGE_COMPENSATED" | "CLEANUP_ATTEMPTED";
  resourceType: PrivateAssetResourceType;
  resourceId: string;
  purpose: PrivateAssetPurpose;
  occurredAt: string;
  succeeded: boolean;
}>;

export interface PrivateAssetAuditPort {
  append(transaction: PrivateAssetTransaction, event: PrivateAssetAuditEvent): Promise<void>;
}

export interface PrivateAssetInspectionPort {
  inspect(
    bytes: Uint8Array,
    declaredContentType: string,
    signal: AbortSignal,
  ): Promise<PrivateAssetInspection>;
}

export interface PrivateAssetReadGrantPort {
  issue(input: Readonly<{
    assetId: string;
    userAccountId: string;
    expiresAt: string;
  }>): Promise<Readonly<{ readGrant: string; expiresAt: string }>>;
}

export interface PrivateAssetIdentityPort {
  nextId(): string;
}

export interface PrivateAssetClockPort {
  now(): string;
}

export interface PrivateAssetStorageKeyPort {
  create(input: Readonly<{
    assetId: string;
    resourceType: PrivateAssetResourceType;
    resourceId: string;
    purpose: PrivateAssetPurpose;
    sha256Hex: string;
  }>): string;
}

/** S04 storage contract is intentionally reused; application DTOs never expose its key. */
export type PrivateAssetStoragePort = PrivateImageStorage;
