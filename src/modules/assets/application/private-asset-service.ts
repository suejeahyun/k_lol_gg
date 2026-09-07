import { createHash } from "node:crypto";

import {
  createStagedPrivateAsset,
  finalizeStagedPrivateAsset,
  planPrivateAssetCleanup,
  privateAssetDigestEquals,
  PrivateAssetError,
  requestPrivateAssetDeletion,
  validateAssetIdentifier,
  validateAssetInstant,
  validatePrivateAssetListQuery,
  validatePrivateAssetUpload,
  PRIVATE_ASSET_PURPOSES,
  type PrivateAssetBinding,
  type PrivateAssetCleanupPlan,
  type PrivateAssetListQuery,
  type PrivateAssetPurpose,
  type PrivateAssetResourceType,
} from "../domain/private-asset";
import {
  toPrivateAssetMetadataDto,
  toPrivateAssetReadGrantDto,
  toPublicAssetDto,
  type PrivateAssetMetadataDto,
  type PrivateAssetReadGrantDto,
  type PublicAssetDto,
} from "./private-asset-dto";
import {
  isOperationalPrivateAssetPurpose,
  mayAccessPrivateAsset,
  mayAccessPrivateAssetBinding,
  type PrivateAssetActor,
  type PrivateAssetHumanActor,
} from "./private-asset-policy";
import type {
  PrivateAssetAuditEvent,
  PrivateAssetAuditPort,
  PrivateAssetAuthorizationPort,
  PrivateAssetClockPort,
  PrivateAssetIdentityPort,
  PrivateAssetInspectionPort,
  PrivateAssetReadGrantPort,
  PrivateAssetRepository,
  PrivateAssetStorageKeyPort,
  PrivateAssetStoragePort,
  PrivateAssetTransaction,
  PrivateAssetUnitOfWork,
} from "./ports/private-asset-ports";

export type StagePrivateAssetInput = Readonly<{
  actor: PrivateAssetHumanActor;
  resourceType: PrivateAssetResourceType;
  resourceId: string;
  purpose: PrivateAssetPurpose;
  bytes: Uint8Array;
  declaredContentType: string;
  declaredSha256Hex: string;
  originalFileName?: string | null;
}>;

export type PrivateAssetBytes = Readonly<{
  assetId: string;
  contentType: string;
  bytes: Uint8Array;
}>;

export type PrivateAssetListResult = Readonly<{
  items: readonly PrivateAssetMetadataDto[];
  nextCursor: string | null;
}>;

export type PrivateAssetServiceDependencies = Readonly<{
  unitOfWork: PrivateAssetUnitOfWork;
  repository: PrivateAssetRepository;
  authorization: PrivateAssetAuthorizationPort;
  audit: PrivateAssetAuditPort;
  inspection: PrivateAssetInspectionPort;
  storage: PrivateAssetStoragePort;
  readGrants: PrivateAssetReadGrantPort;
  assetIds: PrivateAssetIdentityPort;
  eventIds: PrivateAssetIdentityPort;
  storageKeys: PrivateAssetStorageKeyPort;
  clock: PrivateAssetClockPort;
}>;

function unavailable(): never {
  throw new PrivateAssetError("ASSET_NOT_AVAILABLE", "Asset is not available.");
}

function actorUserAccountId(actor: PrivateAssetActor) {
  return actor.purpose === "JOB" ? null : actor.userAccountId;
}

export class PrivateAssetService {
  constructor(private readonly ports: PrivateAssetServiceDependencies) {}

  async stage(input: StagePrivateAssetInput): Promise<PrivateAssetMetadataDto> {
    validateAssetIdentifier(input.resourceId, "resourceId");
    const inspection = await this.ports.inspection.inspect(
      input.bytes,
      input.declaredContentType,
      AbortSignal.timeout(8_000),
    );
    const upload = validatePrivateAssetUpload({
      bytes: input.bytes,
      declaredContentType: input.declaredContentType,
      declaredSha256Hex: input.declaredSha256Hex,
      originalFileName: input.originalFileName,
      inspection,
    });
    const assetId = validateAssetIdentifier(this.ports.assetIds.nextId(), "assetId");
    const now = this.now();
    const binding = await this.ports.unitOfWork.transaction(async (transaction) => {
      const actor = await this.requireActor(transaction, input.actor);
      const resource = await this.ports.repository.resolveResourceForUpdate(transaction, input);
      if (!resource || !mayAccessPrivateAsset(actor, "CREATE", resource, input.purpose)) unavailable();
      const duplicate = await this.ports.repository.findDuplicateForUpdate(transaction, {
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        purpose: input.purpose,
        sha256: upload.sha256,
      });
      if (duplicate) throw new PrivateAssetError("DUPLICATE_ASSET", "An identical asset already exists for this resource and purpose.");
      const storageKey = this.ports.storageKeys.create({
        assetId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        purpose: input.purpose,
        sha256Hex: upload.sha256Hex,
      });
      const asset = createStagedPrivateAsset({
        id: assetId,
        createdByUserAccountId: actor.userAccountId,
        ingestSource: actor.purpose === "ACCOUNT" ? "WEB_USER" : "ADMIN",
        storageProvider: this.ports.storage.storageProvider,
        storageKey,
        purpose: input.purpose,
        upload,
        now,
      });
      const staged = Object.freeze({ ...resource, asset });
      await this.ports.repository.insertStaged(transaction, staged);
      await this.audit(transaction, actor, staged, "STAGED", now, true);
      return staged;
    });

    try {
      await this.ports.storage.stageAt({
        storageKey: binding.asset.storageKey,
        bytes: upload.bytes,
        sha256Hex: upload.sha256Hex,
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      await this.compensateFailedStage(binding, now);
      throw new PrivateAssetError("STORAGE_UNAVAILABLE", "Private storage could not stage the asset.");
    }
    return toPrivateAssetMetadataDto(binding);
  }

  async finalize(actor: PrivateAssetHumanActor, assetId: string): Promise<PrivateAssetMetadataDto> {
    const initial = await this.authorizedBinding(actor, assetId, "READ");
    if (initial.asset.status === "READY") return toPrivateAssetMetadataDto(initial);
    if (initial.asset.status !== "STAGED") unavailable();
    const bytes = await this.readAndVerify(initial);
    if (!bytes) throw new PrivateAssetError("STORAGE_UNAVAILABLE", "The staged object is missing or corrupt.");
    const now = this.now();
    return this.ports.unitOfWork.transaction(async (transaction) => {
      const currentActor = await this.requireActor(transaction, actor);
      const current = await this.ports.repository.findByIdForUpdate(transaction, initial.asset.id);
      if (!current || !mayAccessPrivateAssetBinding(currentActor, "READ", current)) unavailable();
      if (current.asset.status === "READY") return toPrivateAssetMetadataDto(current);
      if (
        current.asset.status !== "STAGED" ||
        current.asset.storageProvider !== initial.asset.storageProvider ||
        current.asset.storageKey !== initial.asset.storageKey ||
        !privateAssetDigestEquals(current.asset.sha256, initial.asset.sha256)
      ) {
        throw new PrivateAssetError("INVALID_TRANSITION", "The staged asset changed before finalization.");
      }
      const asset = finalizeStagedPrivateAsset(current.asset, now);
      const ready = Object.freeze({ ...current, asset });
      await this.ports.repository.updateLifecycle(transaction, asset);
      await this.audit(transaction, currentActor, ready, "READY", now, true);
      return toPrivateAssetMetadataDto(ready);
    });
  }

  async issuePrivateReadGrant(
    actor: PrivateAssetHumanActor,
    assetId: string,
  ): Promise<PrivateAssetReadGrantDto> {
    const binding = await this.authorizedReadyBinding(actor, assetId);
    const expiresAt = new Date(validateAssetInstant(this.now(), "now") + 5 * 60_000).toISOString();
    const grant = await this.ports.readGrants.issue({
      assetId: binding.asset.id,
      userAccountId: actor.userAccountId,
      expiresAt,
    });
    if (grant.expiresAt !== expiresAt || grant.readGrant.length < 32 || grant.readGrant.length > 4096) {
      throw new PrivateAssetError("STORAGE_UNAVAILABLE", "A bounded private read grant could not be issued.");
    }
    return toPrivateAssetReadGrantDto(binding, grant);
  }

  async metadata(actor: PrivateAssetHumanActor, assetId: string): Promise<PrivateAssetMetadataDto> {
    return toPrivateAssetMetadataDto(await this.authorizedBinding(actor, assetId, "READ"));
  }

  /** Grant redemption adapters must call this method; a grant alone never bypasses the READY check. */
  async readPrivateBytes(actor: PrivateAssetHumanActor, assetId: string): Promise<PrivateAssetBytes> {
    const binding = await this.authorizedReadyBinding(actor, assetId);
    const bytes = await this.readAndVerify(binding);
    if (!bytes) throw new PrivateAssetError("STORAGE_UNAVAILABLE", "The private object is missing or corrupt.");
    return Object.freeze({ assetId: binding.asset.id, contentType: binding.asset.contentType, bytes });
  }

  async readPublicBytes(assetId: string): Promise<Readonly<{ asset: PublicAssetDto; bytes: Uint8Array }>> {
    validateAssetIdentifier(assetId, "assetId");
    const binding = await this.ports.unitOfWork.transaction((transaction) =>
      this.ports.repository.findByIdForUpdate(transaction, assetId));
    if (!binding) unavailable();
    const asset = toPublicAssetDto(binding);
    const bytes = await this.readAndVerify(binding);
    if (!bytes) throw new PrivateAssetError("STORAGE_UNAVAILABLE", "The public object is missing or corrupt.");
    return Object.freeze({ asset, bytes });
  }

  async requestDeletion(actor: PrivateAssetHumanActor, assetId: string): Promise<PrivateAssetMetadataDto> {
    validateAssetIdentifier(assetId, "assetId");
    const now = this.now();
    return this.ports.unitOfWork.transaction(async (transaction) => {
      const currentActor = await this.requireActor(transaction, actor);
      const binding = await this.ports.repository.findByIdForUpdate(transaction, assetId);
      if (!binding || !mayAccessPrivateAssetBinding(currentActor, "DELETE", binding)) unavailable();
      if (binding.asset.status === "DELETE_PENDING") return toPrivateAssetMetadataDto(binding);
      const asset = requestPrivateAssetDeletion(binding.asset, now);
      const pending = Object.freeze({ ...binding, asset });
      await this.ports.repository.updateLifecycle(transaction, asset);
      await this.audit(transaction, currentActor, pending, "DELETE_REQUESTED", now, true);
      return toPrivateAssetMetadataDto(pending);
    });
  }

  async list(actor: PrivateAssetHumanActor, query: PrivateAssetListQuery): Promise<PrivateAssetListResult> {
    const validated = validatePrivateAssetListQuery(query);
    return this.ports.unitOfWork.transaction(async (transaction) => {
      const current = await this.requireActor(transaction, actor);
      if (current.purpose !== "ADMIN") unavailable();
      const allowed = current.role === "SUPER_ADMIN"
        ? PRIVATE_ASSET_PURPOSES
        : PRIVATE_ASSET_PURPOSES.filter(isOperationalPrivateAssetPurpose);
      if (validated.purpose && !allowed.includes(validated.purpose)) unavailable();
      const result = await this.ports.repository.list(transaction, validated, allowed);
      if (result.items.length > validated.pageSize) {
        throw new PrivateAssetError("INVALID_INPUT", "Repository returned an unbounded asset page.");
      }
      return Object.freeze({
        items: Object.freeze(result.items.map(toPrivateAssetMetadataDto)),
        nextCursor: result.nextCursor,
      });
    });
  }

  async planCleanup(actor: PrivateAssetActor, limit: number): Promise<readonly PrivateAssetCleanupPlan[]> {
    planPrivateAssetCleanup([], limit);
    return this.ports.unitOfWork.transaction(async (transaction) => {
      const current = await this.requireActor(transaction, actor);
      if (current.purpose !== "JOB" && current.purpose !== "ADMIN") unavailable();
      const rows = await this.ports.repository.listCleanupCandidates(transaction, limit);
      const visible = current.purpose === "ADMIN" && current.role !== "SUPER_ADMIN"
        ? rows.filter((asset) => isOperationalPrivateAssetPurpose(asset.purpose))
        : rows;
      return planPrivateAssetCleanup(visible, limit);
    });
  }

  /** Recovers a process crash between the STAGED database commit and object staging/finalization. */
  async recoverStaleStages(
    actor: PrivateAssetActor,
    before: string,
    limit: number,
  ): Promise<readonly PrivateAssetMetadataDto[]> {
    validateAssetInstant(before, "before");
    planPrivateAssetCleanup([], limit);
    const now = this.now();
    return this.ports.unitOfWork.transaction(async (transaction) => {
      const current = await this.requireActor(transaction, actor);
      if (current.purpose !== "JOB" && current.purpose !== "ADMIN") unavailable();
      const candidates = await this.ports.repository.listStaleStagedCandidates(transaction, before, limit);
      const recovered: PrivateAssetMetadataDto[] = [];
      for (const binding of candidates) {
        if (
          binding.asset.status !== "STAGED" ||
          !mayAccessPrivateAssetBinding(current, "CLEANUP", binding)
        ) continue;
        const pendingAsset = requestPrivateAssetDeletion(binding.asset, now);
        const pending = Object.freeze({ ...binding, asset: pendingAsset });
        await this.ports.repository.updateLifecycle(transaction, pendingAsset);
        await this.audit(transaction, current, pending, "STAGE_COMPENSATED", now, false);
        recovered.push(toPrivateAssetMetadataDto(pending));
      }
      return Object.freeze(recovered);
    });
  }

  async executeCleanup(actor: PrivateAssetActor, plan: PrivateAssetCleanupPlan): Promise<void> {
    const binding = await this.ports.unitOfWork.transaction(async (transaction) => {
      const current = await this.requireActor(transaction, actor);
      const found = await this.ports.repository.findByIdForUpdate(transaction, plan.assetId);
      if (
        !found || found.asset.status !== "DELETE_PENDING" ||
        !mayAccessPrivateAssetBinding(current, "CLEANUP", found) ||
        found.asset.storageProvider !== plan.storageProvider ||
        found.asset.storageKey !== plan.storageKey ||
        !privateAssetDigestEquals(found.asset.sha256, plan.expectedSha256) ||
        found.asset.deleteRequestedAt !== plan.requestedAt
      ) unavailable();
      return found;
    });
    let succeeded = false;
    try {
      if (plan.storageProvider !== this.ports.storage.storageProvider) {
        throw new Error("storage provider mismatch");
      }
      await this.ports.storage.requestDelete(plan.storageKey, AbortSignal.timeout(8_000));
      succeeded = true;
    } catch {
      succeeded = false;
    } finally {
      const attemptedAt = this.now();
      await this.ports.unitOfWork.transaction(async (transaction) => {
        const current = await this.requireActor(transaction, actor);
        const found = await this.ports.repository.findByIdForUpdate(transaction, plan.assetId);
        if (!found || found.asset.status !== "DELETE_PENDING" || !mayAccessPrivateAssetBinding(current, "CLEANUP", found)) {
          unavailable();
        }
        await this.ports.repository.recordCleanupOutcome(transaction, {
          assetId: plan.assetId,
          attemptedAt,
          succeeded,
          failureCode: succeeded ? null : "STORAGE_UNAVAILABLE",
        });
        await this.audit(transaction, current, binding, "CLEANUP_ATTEMPTED", attemptedAt, succeeded);
      });
    }
    if (!succeeded) throw new PrivateAssetError("STORAGE_UNAVAILABLE", "Private storage cleanup failed.");
  }

  private now() {
    const value = this.ports.clock.now();
    validateAssetInstant(value, "clock.now");
    return value;
  }

  private async requireActor<TActor extends PrivateAssetActor>(transaction: PrivateAssetTransaction, actor: TActor) {
    const current = await this.ports.authorization.recheck(transaction, actor);
    if (!current) unavailable();
    return current;
  }

  private async authorizedBinding(
    actor: PrivateAssetHumanActor,
    assetId: string,
    action: "READ" | "DELETE",
  ) {
    validateAssetIdentifier(assetId, "assetId");
    return this.ports.unitOfWork.transaction(async (transaction) => {
      const current = await this.requireActor(transaction, actor);
      const binding = await this.ports.repository.findByIdForUpdate(transaction, assetId);
      if (!binding || !mayAccessPrivateAssetBinding(current, action, binding)) unavailable();
      return binding;
    });
  }

  private async authorizedReadyBinding(actor: PrivateAssetHumanActor, assetId: string) {
    const binding = await this.authorizedBinding(actor, assetId, "READ");
    if (binding.asset.status !== "READY") unavailable();
    return binding;
  }

  private async readAndVerify(binding: PrivateAssetBinding) {
    if (binding.asset.storageProvider !== this.ports.storage.storageProvider) return null;
    try {
      const bytes = await this.ports.storage.read(binding.asset.storageKey, AbortSignal.timeout(8_000));
      return bytes && bytes.byteLength === binding.asset.byteSize &&
        privateAssetDigestEquals(
          createHash("sha256").update(bytes).digest(),
          binding.asset.sha256,
        )
        ? bytes
        : null;
    } catch {
      return null;
    }
  }

  private async compensateFailedStage(binding: PrivateAssetBinding, now: string) {
    await this.ports.unitOfWork.transaction(async (transaction) => {
      const current = await this.ports.repository.findByIdForUpdate(transaction, binding.asset.id);
      if (!current || current.asset.status !== "STAGED") return;
      const asset = requestPrivateAssetDeletion(current.asset, now);
      const pending = Object.freeze({ ...current, asset });
      await this.ports.repository.updateLifecycle(transaction, asset);
      await this.audit(transaction, { purpose: "JOB", principalId: "STAGE_COMPENSATOR", role: "SYSTEM" }, pending, "STAGE_COMPENSATED", now, false);
    });
  }

  private async audit(
    transaction: PrivateAssetTransaction,
    actor: PrivateAssetActor,
    binding: PrivateAssetBinding,
    action: PrivateAssetAuditEvent["action"],
    occurredAt: string,
    succeeded: boolean,
  ) {
    const event: PrivateAssetAuditEvent = Object.freeze({
      eventId: validateAssetIdentifier(this.ports.eventIds.nextId(), "eventId"),
      assetId: binding.asset.id,
      actorPurpose: actor.purpose,
      actorUserAccountId: actorUserAccountId(actor),
      action,
      resourceType: binding.resourceType,
      resourceId: binding.resourceId,
      purpose: binding.asset.purpose,
      occurredAt,
      succeeded,
    });
    await this.ports.audit.append(transaction, event);
  }
}
