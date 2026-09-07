import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createStagedPrivateAsset,
  finalizeStagedPrivateAsset,
  planPrivateAssetCleanup,
  PrivateAssetError,
  requestPrivateAssetDeletion,
  validatePrivateAssetListQuery,
  validatePrivateAssetUpload,
  type PrivateAssetBinding,
  type PrivateAssetListQuery,
  type PrivateAssetPurpose,
  type PrivateAssetRecord,
} from "../src/modules/assets/domain/private-asset";
import {
  concealPrivateAssetAccess,
  mayAccessPrivateAsset,
  type PrivateAssetActor,
  type PrivateAssetHumanActor,
  type PrivateAssetResourceBinding,
} from "../src/modules/assets/application/private-asset-policy";
import {
  toPrivateAssetReadGrantDto,
  toPublicAssetDto,
} from "../src/modules/assets/application/private-asset-dto";
import { PrivateAssetService } from "../src/modules/assets/application/private-asset-service";
import type {
  PrivateAssetAuditEvent,
  PrivateAssetRepository,
  PrivateAssetTransaction,
} from "../src/modules/assets/application/ports/private-asset-ports";

const NOW = "2026-09-07T00:00:00.000Z";
const OWNER_ID = "10000000-0000-4000-8000-000000000000";
const OTHER_ID = "20000000-0000-4000-8000-000000000000";
const RESOURCE_ID = "30000000-0000-4000-8000-000000000000";
const ASSET_ID = "40000000-0000-4000-8000-000000000000";

const owner: PrivateAssetHumanActor = {
  userAccountId: OWNER_ID,
  sessionId: "50000000-0000-4000-8000-000000000000",
  authVersion: 0,
  purpose: "ACCOUNT",
  role: "USER",
  approvalStatus: "APPROVED",
};
const other: PrivateAssetHumanActor = { ...owner, userAccountId: OTHER_ID };
const admin: PrivateAssetHumanActor = {
  userAccountId: OTHER_ID,
  sessionId: "60000000-0000-4000-8000-000000000000",
  authVersion: 0,
  purpose: "ADMIN",
  role: "ADMIN",
  approvalStatus: "APPROVED",
};
const superAdmin: PrivateAssetHumanActor = { ...admin, role: "SUPER_ADMIN" };
const job: PrivateAssetActor = { purpose: "JOB", role: "SYSTEM", principalId: "ASSET_CLEANUP" };

function pngBytes() {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    1, 2, 3, 4,
    0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
  ]);
}

function validUpload(bytes = pngBytes()) {
  return validatePrivateAssetUpload({
    bytes,
    declaredContentType: "image/png",
    declaredSha256Hex: createHash("sha256").update(bytes).digest("hex"),
    originalFileName: "결과.png",
    inspection: { contentType: "image/png", width: 640, height: 360, pageCount: 1, decoded: true },
  });
}

function asset(overrides: Partial<PrivateAssetRecord> = {}): PrivateAssetRecord {
  return {
    id: ASSET_ID,
    createdByUserAccountId: OWNER_ID,
    ingestSource: "WEB_USER",
    storageProvider: "FAKE_LOCAL",
    storageKey: `private/${ASSET_ID}.bin`,
    originalFileName: "결과.png",
    contentType: "image/png",
    byteSize: pngBytes().byteLength,
    width: 640,
    height: 360,
    sha256: createHash("sha256").update(pngBytes()).digest(),
    purpose: "MATCH_SCOREBOARD",
    status: "STAGED",
    readyAt: null,
    deleteRequestedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function binding(overrides: Partial<PrivateAssetBinding> = {}): PrivateAssetBinding {
  return {
    asset: asset(),
    resourceType: "MATCH_SUBMISSION",
    resourceId: RESOURCE_ID,
    ownerUserAccountId: OWNER_ID,
    public: false,
    ...overrides,
  };
}

test("upload validation binds declared MIME, decoded dimensions, exact container, SHA-256, and a safe name", () => {
  const upload = validUpload();
  assert.equal(upload.contentType, "image/png");
  assert.equal(upload.byteSize, 24);
  assert.equal(upload.sha256.byteLength, 32);
  assert.throws(() => validatePrivateAssetUpload({
    bytes: pngBytes(),
    declaredContentType: "image/jpeg",
    declaredSha256Hex: upload.sha256Hex,
    inspection: { contentType: "image/png", width: 640, height: 360, pageCount: 1, decoded: true },
  }), (error: unknown) => error instanceof PrivateAssetError && error.code === "INVALID_INPUT");
  assert.throws(() => validatePrivateAssetUpload({
    bytes: pngBytes(),
    declaredContentType: "image/png",
    declaredSha256Hex: "0".repeat(64),
    inspection: { contentType: "image/png", width: 5000, height: 360, pageCount: 1, decoded: true },
  }), PrivateAssetError);
  assert.throws(() => validatePrivateAssetUpload({
    bytes: pngBytes(),
    declaredContentType: "image/png",
    declaredSha256Hex: upload.sha256Hex,
    originalFileName: "../secret.png",
    inspection: { contentType: "image/png", width: 640, height: 360, pageCount: 1, decoded: true },
  }), PrivateAssetError);
});

test("lifecycle is explicit and cleanup plans are deterministic, bounded, and DELETE_PENDING-only", () => {
  const staged = createStagedPrivateAsset({
    id: ASSET_ID,
    createdByUserAccountId: OWNER_ID,
    ingestSource: "WEB_USER",
    storageProvider: "FAKE_LOCAL",
    storageKey: `private/${ASSET_ID}.bin`,
    purpose: "MATCH_SCOREBOARD",
    upload: validUpload(),
    now: NOW,
  });
  const ready = finalizeStagedPrivateAsset(staged, "2026-09-07T00:01:00.000Z");
  assert.equal(ready.status, "READY");
  assert.throws(() => finalizeStagedPrivateAsset(ready, NOW), /STAGED/);
  const pending = requestPrivateAssetDeletion(ready, "2026-09-07T00:02:00.000Z");
  assert.equal(pending.readyAt, ready.readyAt);
  assert.throws(() => requestPrivateAssetDeletion(pending, NOW), /already pending/);
  const later = asset({ id: `${ASSET_ID.slice(0, -1)}1`, status: "DELETE_PENDING", deleteRequestedAt: "2026-09-07T00:03:00.000Z" });
  assert.deepEqual(planPrivateAssetCleanup([later, pending, staged], 2).map((plan) => plan.assetId), [pending.id, later.id]);
  assert.throws(() => planPrivateAssetCleanup([pending], 101), /between 1 and 100/);
  assert.throws(() => validatePrivateAssetListQuery({ pageSize: 0 }), /between 1 and 100/);
});

test("purpose/resource and actor authorization form a closed allowlist", () => {
  const match: PrivateAssetResourceBinding = {
    resourceType: "MATCH_SUBMISSION", resourceId: RESOURCE_ID, ownerUserAccountId: OWNER_ID, public: false,
  };
  const discipline: PrivateAssetResourceBinding = {
    resourceType: "DISCIPLINE_TASK", resourceId: RESOURCE_ID, ownerUserAccountId: OWNER_ID, public: false,
  };
  const security: PrivateAssetResourceBinding = {
    resourceType: "SECURITY_INCIDENT", resourceId: RESOURCE_ID, ownerUserAccountId: OWNER_ID, public: false,
  };
  assert.equal(mayAccessPrivateAsset(owner, "CREATE", match, "MATCH_SCOREBOARD"), true);
  assert.equal(mayAccessPrivateAsset(other, "READ", match, "MATCH_SCOREBOARD"), false);
  assert.equal(mayAccessPrivateAsset(owner, "CREATE", discipline, "DISCIPLINE_ISSUE"), true);
  assert.equal(mayAccessPrivateAsset(owner, "CREATE", match, "DISCIPLINE_ISSUE"), false);
  assert.equal(mayAccessPrivateAsset(admin, "CREATE", security, "SECURITY_INCIDENT_EVIDENCE"), false);
  assert.equal(mayAccessPrivateAsset(superAdmin, "CREATE", security, "SECURITY_INCIDENT_EVIDENCE"), true);
  assert.equal(mayAccessPrivateAsset(job, "CLEANUP", security, "SECURITY_INCIDENT_EVIDENCE"), true);
  assert.equal(mayAccessPrivateAsset(job, "READ", security, "SECURITY_INCIDENT_EVIDENCE"), false);
});

test("forbidden and absent are deliberately rendered with one outward problem", () => {
  assert.strictEqual(concealPrivateAssetAccess(403), concealPrivateAssetAccess(404));
  assert.deepEqual(concealPrivateAssetAccess(403), {
    status: 404,
    body: {
      code: "ASSET_NOT_AVAILABLE",
      title: "자산을 찾을 수 없습니다.",
      detail: "요청한 자산을 사용할 수 없습니다.",
    },
  });
});

test("public and private DTOs never expose storage keys, URL locators, creator IDs, or SHA-256", () => {
  const readyGallery = binding({
    asset: asset({ purpose: "GALLERY", status: "READY", readyAt: NOW }),
    resourceType: "GALLERY_ENTRY",
    public: true,
  });
  const publicDto = toPublicAssetDto(readyGallery);
  const privateDto = toPrivateAssetReadGrantDto(readyGallery, { readGrant: "opaque".repeat(8), expiresAt: NOW });
  for (const dto of [publicDto, privateDto]) {
    const serialized = JSON.stringify(dto);
    assert.equal(serialized.includes("storageKey"), false);
    assert.equal(serialized.includes("storageProvider"), false);
    assert.equal(serialized.includes("sha256"), false);
    assert.equal(serialized.includes(OWNER_ID), false);
    assert.equal(serialized.includes("http"), false);
  }
  assert.throws(() => toPublicAssetDto(binding({ asset: asset({ status: "STAGED" }) })), /not available/);
});

class MemoryRepository implements PrivateAssetRepository {
  readonly assets = new Map<string, PrivateAssetBinding>();
  readonly resources = new Map<string, PrivateAssetResourceBinding>();
  readonly cleanupOutcomes: Array<{ assetId: string; succeeded: boolean }> = [];
  lastAllowedPurposes: readonly PrivateAssetPurpose[] = [];

  async resolveResourceForUpdate(_transaction: PrivateAssetTransaction, resource: { resourceType: string; resourceId: string }) {
    return this.resources.get(`${resource.resourceType}:${resource.resourceId}`) ?? null;
  }
  async findDuplicateForUpdate(_transaction: PrivateAssetTransaction, input: { resourceType: string; resourceId: string; purpose: PrivateAssetPurpose; sha256: Uint8Array }) {
    return [...this.assets.values()].find((entry) =>
      entry.resourceType === input.resourceType && entry.resourceId === input.resourceId &&
      entry.asset.purpose === input.purpose && Buffer.from(entry.asset.sha256).equals(Buffer.from(input.sha256))) ?? null;
  }
  async insertStaged(_transaction: PrivateAssetTransaction, value: PrivateAssetBinding) { this.assets.set(value.asset.id, value); }
  async findByIdForUpdate(_transaction: PrivateAssetTransaction, assetId: string) { return this.assets.get(assetId) ?? null; }
  async updateLifecycle(_transaction: PrivateAssetTransaction, value: PrivateAssetRecord) {
    const current = this.assets.get(value.id);
    if (!current) throw new Error("missing");
    this.assets.set(value.id, { ...current, asset: value });
  }
  async list(_transaction: PrivateAssetTransaction, query: PrivateAssetListQuery, allowed: readonly PrivateAssetPurpose[]) {
    this.lastAllowedPurposes = allowed;
    const items = [...this.assets.values()].filter((entry) => allowed.includes(entry.asset.purpose)).slice(0, query.pageSize);
    return { items, nextCursor: null };
  }
  async listCleanupCandidates(_transaction: PrivateAssetTransaction, limit: number) {
    const completed = new Set(this.cleanupOutcomes.filter((item) => item.succeeded).map((item) => item.assetId));
    return [...this.assets.values()].map((entry) => entry.asset).filter((entry) => !completed.has(entry.id)).slice(0, limit);
  }
  async listStaleStagedCandidates(_transaction: PrivateAssetTransaction, before: string, limit: number) {
    return [...this.assets.values()].filter((entry) =>
      entry.asset.status === "STAGED" && entry.asset.createdAt < before).slice(0, limit);
  }
  async recordCleanupOutcome(_transaction: PrivateAssetTransaction, outcome: { assetId: string; succeeded: boolean }) {
    this.cleanupOutcomes.push(outcome);
  }
}

function serviceEnvironment(options: Readonly<{ failStage?: boolean; failDelete?: boolean }> = {}) {
  const repository = new MemoryRepository();
  const objects = new Map<string, Uint8Array>();
  const audits: PrivateAssetAuditEvent[] = [];
  let next = 0;
  repository.resources.set(`MATCH_SUBMISSION:${RESOURCE_ID}`, {
    resourceType: "MATCH_SUBMISSION", resourceId: RESOURCE_ID, ownerUserAccountId: OWNER_ID, public: false,
  });
  const service = new PrivateAssetService({
    unitOfWork: { async transaction(work) { return work({ transactionId: `tx-${next += 1}` }); } },
    repository,
    authorization: { async recheck(_transaction, actor) { return actor; } },
    audit: { async append(_transaction, event) { audits.push(event); } },
    inspection: { async inspect() { return { contentType: "image/png", width: 640, height: 360, pageCount: 1, decoded: true }; } },
    storage: {
      storageProvider: "FAKE_LOCAL",
      async stageAt(input) {
        if (options.failStage) throw new Error("stage failed");
        objects.set(input.storageKey, Uint8Array.from(input.bytes));
      },
      async read(key) { return objects.get(key) ?? null; },
      async requestDelete(key) {
        if (options.failDelete) throw new Error("delete failed");
        objects.delete(key);
      },
    },
    readGrants: { async issue(input) { return { readGrant: "opaque-grant-".repeat(4), expiresAt: input.expiresAt }; } },
    assetIds: { nextId: () => ASSET_ID },
    eventIds: { nextId: () => `event-${next += 1}` },
    storageKeys: { create: (input) => `private/${input.assetId}.bin` },
    clock: { now: () => NOW },
  });
  return { service, repository, objects, audits };
}

test("application saga rechecks ownership, blocks duplicates, finalizes only verified bytes, and reads READY only", async () => {
  const env = serviceEnvironment();
  const bytes = pngBytes();
  const input = {
    actor: owner,
    resourceType: "MATCH_SUBMISSION" as const,
    resourceId: RESOURCE_ID,
    purpose: "MATCH_SCOREBOARD" as const,
    bytes,
    declaredContentType: "image/png",
    declaredSha256Hex: createHash("sha256").update(bytes).digest("hex"),
  };
  const staged = await env.service.stage(input);
  assert.equal(staged.status, "STAGED");
  await assert.rejects(() => env.service.readPrivateBytes(owner, ASSET_ID), (error: unknown) =>
    error instanceof PrivateAssetError && error.code === "ASSET_NOT_AVAILABLE");
  await assert.rejects(() => env.service.finalize(other, ASSET_ID), (error: unknown) =>
    error instanceof PrivateAssetError && error.code === "ASSET_NOT_AVAILABLE");
  const ready = await env.service.finalize(owner, ASSET_ID);
  assert.equal(ready.status, "READY");
  assert.equal((await env.service.readPrivateBytes(owner, ASSET_ID)).bytes.byteLength, bytes.byteLength);
  assert.equal((await env.service.issuePrivateReadGrant(owner, ASSET_ID)).readGrant.startsWith("http"), false);
  await assert.rejects(() => env.service.stage(input), (error: unknown) =>
    error instanceof PrivateAssetError && error.code === "DUPLICATE_ASSET");
});

test("failed staging enters DELETE_PENDING; cleanup is retryable and keeps the tombstone", async () => {
  const env = serviceEnvironment({ failStage: true });
  const bytes = pngBytes();
  await assert.rejects(() => env.service.stage({
    actor: owner,
    resourceType: "MATCH_SUBMISSION",
    resourceId: RESOURCE_ID,
    purpose: "MATCH_SCOREBOARD",
    bytes,
    declaredContentType: "image/png",
    declaredSha256Hex: createHash("sha256").update(bytes).digest("hex"),
  }), (error: unknown) => error instanceof PrivateAssetError && error.code === "STORAGE_UNAVAILABLE");
  assert.equal(env.repository.assets.get(ASSET_ID)?.asset.status, "DELETE_PENDING");
  const [plan] = await env.service.planCleanup(job, 10);
  assert.ok(plan);
  await env.service.executeCleanup(job, plan);
  assert.equal(env.repository.assets.get(ASSET_ID)?.asset.status, "DELETE_PENDING");
  assert.deepEqual(env.repository.cleanupOutcomes.map(({ assetId, succeeded }) => ({ assetId, succeeded })), [{ assetId: ASSET_ID, succeeded: true }]);
  assert.equal((await env.service.planCleanup(job, 10)).length, 0);
});

test("a bounded worker sweep turns crash-abandoned STAGED rows into cleanup tombstones", async () => {
  const env = serviceEnvironment();
  env.repository.assets.set(ASSET_ID, binding({ asset: asset({ createdAt: "2026-09-06T00:00:00.000Z" }) }));
  const recovered = await env.service.recoverStaleStages(job, "2026-09-06T12:00:00.000Z", 10);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]?.status, "DELETE_PENDING");
  assert.equal(env.repository.assets.get(ASSET_ID)?.asset.status, "DELETE_PENDING");
  await assert.rejects(() => env.service.recoverStaleStages(owner, "2026-09-07T00:00:00.000Z", 10), (error: unknown) =>
    error instanceof PrivateAssetError && error.code === "ASSET_NOT_AVAILABLE");
});

test("admin list is bounded and excludes SUPER-only purposes at the repository boundary", async () => {
  const env = serviceEnvironment();
  await env.service.list(admin, { pageSize: 25 });
  assert.equal(env.repository.lastAllowedPurposes.includes("SECURITY_INCIDENT_EVIDENCE"), false);
  await env.service.list(superAdmin, { pageSize: 25 });
  assert.equal(env.repository.lastAllowedPurposes.includes("SECURITY_INCIDENT_EVIDENCE"), true);
  await assert.rejects(() => env.service.list(admin, { pageSize: 101 }), /between 1 and 100/);
  await assert.rejects(() => env.service.list(admin, { pageSize: 10, purpose: "SECURITY_INCIDENT_EVIDENCE" }), (error: unknown) =>
    error instanceof PrivateAssetError && error.code === "ASSET_NOT_AVAILABLE");
});
