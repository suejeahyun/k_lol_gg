import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";

import { MatchService, type MatchCommandContext } from "../src/modules/matches/application/match-service";
import type { PrivateImageStorage, ScoreboardOcr } from "../src/modules/matches/application/ports/private-image-storage";
import type {
  MatchCommandEnvelope,
  MatchRepository,
  PrivateImageAttachmentInput,
} from "../src/modules/matches/application/ports/match-repository";
import { MatchImageWorkGate } from "../src/modules/matches/infrastructure/match-image-work-gate";

const userId = "10000000-0000-4000-8000-000000000000";
const submissionId = "20000000-0000-4000-8000-000000000000";
const imageId = "30000000-0000-4000-8000-000000000000";

const context: MatchCommandContext = {
  actor: {
    userAccountId: userId,
    sessionId: "40000000-0000-4000-8000-000000000000",
    purpose: "ACCOUNT",
    requiredRole: "USER",
  },
  requestId: "50000000-0000-4000-8000-000000000000",
  idempotencyMaterial: new TextEncoder().encode("raw-browser-idempotency-key-12345"),
  rateLimitMaterial: new TextEncoder().encode("test-network-203.0.113.8"),
};

const adminContext: MatchCommandContext = {
  ...context,
  actor: {
    userAccountId: userId,
    sessionId: "40000000-0000-4000-8000-000000000001",
    purpose: "ADMIN",
    requiredRole: "ADMIN",
  },
  idempotencyMaterial: new TextEncoder().encode("admin-import-idempotency-key-12345"),
};

const submissionBody = {
  requestId: "private-client-request-123",
  seasonId: null,
  title: "9월 내전",
  organizer: "진행자",
  seriesNumber: 1,
  note: "비공개 메모",
  playedOn: "2026-09-01",
  startedAt: null,
  expectedGameCount: 2,
  teamBalanceDraftId: null,
};

test("mutation and source hashes use a domain-separated HMAC pepper", async () => {
  const captured: { envelope?: MatchCommandEnvelope; source?: Buffer } = {};
  const repository = {
    async createSubmission(envelope: MatchCommandEnvelope, _input: unknown, source: Buffer) {
      captured.envelope = envelope;
      captured.source = source;
      return { body: { submissionId }, status: 201, revision: 0, replayed: false };
    },
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 7));
  await service.createSubmission(context, submissionBody);
  assert.equal(captured.envelope?.keyHash.length, 32);
  assert.equal(captured.envelope?.requestHash.length, 32);
  assert.equal(captured.source?.length, 32);
  assert.equal(captured.envelope?.keyHash.equals(captured.envelope.requestHash), false);
  assert.equal(captured.source?.includes(Buffer.from(submissionBody.requestId, "utf8")), false);
  assert.throws(() => new MatchService(repository, Buffer.alloc(31)), /at least 32 bytes/);
});

test("admin direct import stays in the private submission saga and only produces review candidates", async () => {
  const storage = new TrackingStorage();
  const captured: { sourceHash: Buffer | null; attached: PrivateImageAttachmentInput | null; cancelScope: string | null } = {
    sourceHash: null,
    attached: null,
    cancelScope: null,
  };
  const repository = {
    async createAdminImport(_envelope: MatchCommandEnvelope, _input: unknown, sourceHash: Buffer) {
      captured.sourceHash = sourceHash;
      return { body: { submissionId, status: "AWAITING_UPLOAD", revision: 0 }, status: 201, revision: 0, replayed: false };
    },
    async reservePrivateImageUpload(_envelope: MatchCommandEnvelope, input: { storageKey: string }) {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: input.storageKey,
      } as const;
    },
    async markPrivateImageUploadStaged() {},
    async finalizePrivateImageUpload(_envelope: MatchCommandEnvelope, input: PrivateImageAttachmentInput) {
      captured.attached = input;
      return { body: { submissionId, status: "PENDING_REVIEW", revision: 1 }, status: 201, revision: 1, replayed: false };
    },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() {},
    async confirmPrivateImageUploadDeleted() {},
    async cancelSubmission(envelope: MatchCommandEnvelope) {
      captured.cancelScope = envelope.scope;
      return { body: { submissionId, status: "CANCELLED", revision: 2 }, status: 200, revision: 2, replayed: false };
    },
  } as unknown as MatchRepository;
  const ocr: ScoreboardOcr = {
    async inspect(input) {
      return {
        schemaVersion: 1,
        provider: "LOCAL_FIXTURE",
        providerRequestReferenceHash: null,
        gameNumber: input.gameNumber,
        needsHumanReview: true,
        participants: [],
      };
    },
  };
  const service = new MatchService(repository, Buffer.alloc(32, 23), storage, ocr);
  await service.createAdminImport(adminContext, {
    seasonId: null,
    title: "관리자 캡처 검토",
    playedOn: "2026-09-01",
    startedAt: null,
  });
  const bytes = await pngFixture();
  const declaration = {
    submissionId,
    expectedRevision: 0,
    gameNumber: 1,
    contentType: "image/png" as const,
    byteSize: bytes.byteLength,
    sha256Hex: createHash("sha256").update(bytes).digest("hex"),
    originalFileName: "admin-capture.png",
  };
  const prepared = await service.prepareAdminImportImageUpload(adminContext, declaration);
  assert.equal(prepared.kind, "RESERVED");
  if (prepared.kind !== "RESERVED") throw new Error("fixture reservation missing");
  const result = await service.finalizeAdminImportImageUpload(
    adminContext,
    prepared.reservationId,
    declaration,
    bytes,
  );
  assert.equal(result.body.status, "PENDING_REVIEW");
  assert.equal(captured.sourceHash?.byteLength, 32);
  assert.equal(captured.attached?.ingestSource, "ADMIN");
  assert.equal(captured.attached?.ocrResult.status, "SUCCEEDED");
  assert.equal("matchId" in result.body, false);
  const cancelled = await service.cancelAdminImport(adminContext, submissionId, 1, {});
  assert.equal(cancelled.body.status, "CANCELLED");
  assert.equal(captured.cancelScope, `admin:match-imports:${submissionId}:cancel`);
  assert.throws(() => service.createAdminImport(context, {
    seasonId: null,
    title: "권한 없음",
    playedOn: "2026-09-01",
    startedAt: null,
  }), /관리자 세션/);
  await assert.rejects(service.prepareSubmissionImageUpload(adminContext, declaration), /계정 세션/);
});

class TrackingStorage implements PrivateImageStorage {
  readonly storageProvider = "FAKE_LOCAL";
  readonly deleted: string[] = [];
  stagedKey: string | null = null;
  async stageAt(input: { storageKey: string }) { this.stagedKey = input.storageKey; }
  async read() { return null; }
  async requestDelete(storageKey: string) {
    this.deleted.push(storageKey);
  }
}

const failingOcr: ScoreboardOcr = {
  async inspect() {
    throw new Error("fixture timeout");
  },
};

async function pngFixture() {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: "#dff5ff" } })
    .png()
    .toBuffer();
}

test("storage object is compensation-deleted when the DB attach fails", async () => {
  const storage = new TrackingStorage();
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: "fixture-key",
      };
    },
    async markPrivateImageUploadStaged() {},
    async finalizePrivateImageUpload() {
      throw new Error("fixture database failure");
    },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() {},
    async confirmPrivateImageUploadDeleted() {},
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 9), storage, failingOcr);
  await assert.rejects(
    service.attachSubmissionImage(context, {
      submissionId,
      expectedRevision: 0,
      gameNumber: 1,
      bytes: await pngFixture(),
      contentType: "image/png",
      originalFileName: "score.png",
    }),
    /fixture database failure/,
  );
  assert.deepEqual(storage.deleted, [storage.stagedKey]);
});

test("OCR timeout becomes a bounded FAILED candidate and manual review remains possible", async () => {
  const storage = new TrackingStorage();
  let attached: PrivateImageAttachmentInput | undefined;
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: "fixture-key",
      };
    },
    async markPrivateImageUploadStaged() {},
    async finalizePrivateImageUpload(_envelope: MatchCommandEnvelope, input: PrivateImageAttachmentInput) {
      attached = input;
      return {
        body: { submissionId, status: "AWAITING_UPLOAD", revision: 1 },
        status: 201,
        revision: 1,
        replayed: false,
      };
    },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() {},
    async confirmPrivateImageUploadDeleted() {},
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 11), storage, failingOcr);
  await service.attachSubmissionImage(context, {
    submissionId: submissionId.toUpperCase(),
    expectedRevision: 0,
    gameNumber: 1,
    bytes: await pngFixture(),
    contentType: "image/png",
  });
  assert.deepEqual(attached?.ocrResult, { status: "FAILED", errorCode: "OCR_UNAVAILABLE" });
  assert.equal(attached?.submissionId, submissionId);
  assert.deepEqual(storage.deleted, []);
});

test("a finalize replay never deletes the deterministic canonical storage object", async () => {
  const storage = new TrackingStorage();
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: "fixture-key",
      };
    },
    async markPrivateImageUploadStaged() {},
    async finalizePrivateImageUpload() {
      return {
        body: { submissionId, status: "AWAITING_UPLOAD", revision: 1 },
        status: 201,
        revision: 1,
        replayed: true,
      };
    },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() {},
    async confirmPrivateImageUploadDeleted() {},
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 12), storage, failingOcr);
  await service.attachSubmissionImage(context, {
    submissionId,
    expectedRevision: 0,
    gameNumber: 1,
    bytes: await pngFixture(),
    contentType: "image/png",
  });
  assert.deepEqual(storage.deleted, []);
});

test("a completed receipt replay returns before decode, storage and OCR work", async () => {
  const storage = new TrackingStorage();
  let finalized = false;
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "REPLAY",
        result: {
          body: { submissionId, revision: 1 },
          status: 201,
          revision: 1,
          replayed: true,
        },
      };
    },
    async finalizePrivateImageUpload() { finalized = true; throw new Error("must not run"); },
  } as unknown as MatchRepository;
  let inspected = false;
  const ocr: ScoreboardOcr = {
    async inspect() { inspected = true; throw new Error("must not run"); },
  };
  const service = new MatchService(repository, Buffer.alloc(32, 13), storage, ocr);
  const result = await service.attachSubmissionImage(context, {
    submissionId,
    expectedRevision: 0,
    gameNumber: 1,
    bytes: await pngFixture(),
    contentType: "image/png",
  });
  assert.equal(result.replayed, true);
  assert.equal(storage.stagedKey, null);
  assert.equal(inspected, false);
  assert.equal(finalized, false);
});

test("delete failure leaves a durable DELETE_PENDING cleanup request", async () => {
  let cleanupRequested = false;
  let deleteConfirmed = false;
  class FailingDeleteStorage extends TrackingStorage {
    override async requestDelete() { throw new Error("fixture delete unavailable"); }
  }
  const storage = new FailingDeleteStorage();
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: "fixture-key",
      };
    },
    async markPrivateImageUploadStaged() {},
    async finalizePrivateImageUpload() { throw new Error("fixture finalization failure"); },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() { cleanupRequested = true; },
    async confirmPrivateImageUploadDeleted() { deleteConfirmed = true; },
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 14), storage, failingOcr);
  await assert.rejects(
    service.attachSubmissionImage(context, {
      submissionId,
      expectedRevision: 0,
      gameNumber: 1,
      bytes: await pngFixture(),
      contentType: "image/png",
    }),
    /정리 작업을 예약했지만/,
  );
  assert.equal(cleanupRequested, true);
  assert.equal(deleteConfirmed, false);
});

test("missing fake object after process restart fails closed instead of returning corrupt bytes", async () => {
  const storage = new TrackingStorage();
  const repository = {
    async getAdminPrivateImage() {
      return {
        storageProvider: "FAKE_LOCAL",
        storageKey: "lost-after-restart",
        contentType: "image/png",
        byteSize: 128,
        sha256: Buffer.alloc(32),
      };
    },
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 15), storage, failingOcr);
  await assert.rejects(
    service.getAdminPrivateImage(submissionId, "70000000-0000-4000-8000-000000000000"),
    /원본이 없거나 무결성/,
  );
});

test("image decode/OCR work is admitted through a bounded FIFO gate", async () => {
  const gate = new MatchImageWorkGate(1, 1, 1_000);
  const releaseFirst = await gate.acquire();
  const second = gate.acquire();
  await assert.rejects(gate.acquire(), /이미지 분석 작업이 혼잡/);
  assert.deepEqual(gate.snapshot(), { active: 1, queued: 1 });
  releaseFirst();
  const releaseSecond = await second;
  assert.deepEqual(gate.snapshot(), { active: 1, queued: 0 });
  releaseSecond();
  releaseSecond();
  assert.deepEqual(gate.snapshot(), { active: 0, queued: 0 });
});

test("image work queue times out without leaking an active lease", async () => {
  const gate = new MatchImageWorkGate(1, 1, 10);
  const release = await gate.acquire();
  await assert.rejects(gate.acquire(), /대기 시간이 초과/);
  assert.deepEqual(gate.snapshot(), { active: 1, queued: 0 });
  release();
  assert.deepEqual(gate.snapshot(), { active: 0, queued: 0 });
});

test("private storage keys bind the idempotency key while same-key retries remain stable", async () => {
  const storage = new TrackingStorage();
  const storageKeys: string[] = [];
  const repository = {
    async reservePrivateImageUpload(_envelope: MatchCommandEnvelope, input: { storageKey: string }) {
      storageKeys.push(input.storageKey);
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: input.storageKey,
      } as const;
    },
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 16), storage, failingOcr);
  const declaration = {
    submissionId,
    expectedRevision: 0,
    gameNumber: 1,
    contentType: "image/png",
    byteSize: 128,
    sha256Hex: "ab".repeat(32),
  };
  await service.prepareSubmissionImageUpload(context, declaration);
  await service.prepareSubmissionImageUpload(context, declaration);
  await service.prepareSubmissionImageUpload({
    ...context,
    idempotencyMaterial: new TextEncoder().encode("a-distinct-browser-action-key-67890"),
  }, declaration);
  assert.equal(storageKeys[0], storageKeys[1]);
  assert.notEqual(storageKeys[0], storageKeys[2]);
});

test("an abort-aware never-resolving storage stage times out and reaches durable cleanup", async () => {
  let stageAborted = false;
  let cleanupRequested = false;
  let cleanupConfirmed = false;
  const storage: PrivateImageStorage = {
    storageProvider: "FAKE_LOCAL",
    async stageAt(input) {
      await new Promise<void>((_resolve, reject) => input.signal.addEventListener("abort", () => {
        stageAborted = true;
        reject(input.signal.reason);
      }, { once: true }));
    },
    async read() { return null; },
    async requestDelete() {},
  };
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: "timeout-fixture",
      };
    },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() { cleanupRequested = true; },
    async confirmPrivateImageUploadDeleted() { cleanupConfirmed = true; },
  } as unknown as MatchRepository;
  const service = new MatchService(
    repository,
    Buffer.alloc(32, 17),
    storage,
    failingOcr,
    { storageStageMs: 15, storageReadMs: 15, storageDeleteMs: 15, ocrMs: 15 },
  );
  await assert.rejects(service.attachSubmissionImage(context, {
    submissionId,
    expectedRevision: 0,
    gameNumber: 1,
    bytes: await pngFixture(),
    contentType: "image/png",
  }), /비공개 이미지 저장에 실패/);
  assert.equal(stageAborted, true);
  assert.equal(cleanupRequested, true);
  assert.equal(cleanupConfirmed, false);
});

test("a late stage completion remains visibly DELETE_PENDING for the cleanup worker", async () => {
  let objectExists = false;
  let cleanupRequested = false;
  let cleanupConfirmed = false;
  let deleteCalled = false;
  const storage: PrivateImageStorage = {
    storageProvider: "FAKE_LOCAL",
    async stageAt() {
      await new Promise<void>((resolve) => setTimeout(() => {
        objectExists = true;
        resolve();
      }, 35));
    },
    async read() { return null; },
    async requestDelete() { deleteCalled = true; objectExists = false; },
  };
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: "late-stage-fixture",
      };
    },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() { cleanupRequested = true; },
    async confirmPrivateImageUploadDeleted() { cleanupConfirmed = true; },
  } as unknown as MatchRepository;
  const service = new MatchService(
    repository,
    Buffer.alloc(32, 19),
    storage,
    failingOcr,
    { storageStageMs: 10, storageReadMs: 20, storageDeleteMs: 20, ocrMs: 20 },
  );
  await assert.rejects(service.attachSubmissionImage(context, {
    submissionId,
    expectedRevision: 0,
    gameNumber: 1,
    bytes: await pngFixture(),
    contentType: "image/png",
  }), /비공개 이미지 저장에 실패/);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(objectExists, true);
  assert.equal(cleanupRequested, true);
  assert.equal(deleteCalled, false);
  assert.equal(cleanupConfirmed, false);
});

test("an abort-aware OCR timeout becomes review-first FAILED without holding the request", async () => {
  const storage = new TrackingStorage();
  let ocrAborted = false;
  let attached: PrivateImageAttachmentInput | undefined;
  const ocr: ScoreboardOcr = {
    async inspect(input) {
      return new Promise((_resolve, reject) => input.signal.addEventListener("abort", () => {
        ocrAborted = true;
        reject(input.signal.reason);
      }, { once: true }));
    },
  };
  const repository = {
    async reservePrivateImageUpload() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        storageProvider: "FAKE_LOCAL",
        storageKey: "ocr-timeout-fixture",
      };
    },
    async markPrivateImageUploadStaged() {},
    async finalizePrivateImageUpload(_envelope: MatchCommandEnvelope, input: PrivateImageAttachmentInput) {
      attached = input;
      return { body: { submissionId, revision: 1 }, status: 201, revision: 1, replayed: false };
    },
    async cancelPrivateImageUpload() {},
    async requestPrivateImageUploadCleanup() {},
    async confirmPrivateImageUploadDeleted() {},
  } as unknown as MatchRepository;
  const service = new MatchService(
    repository,
    Buffer.alloc(32, 18),
    storage,
    ocr,
    { storageStageMs: 50, storageReadMs: 50, storageDeleteMs: 50, ocrMs: 15 },
  );
  await service.attachSubmissionImage(context, {
    submissionId,
    expectedRevision: 0,
    gameNumber: 1,
    bytes: await pngFixture(),
    contentType: "image/png",
  });
  assert.equal(ocrAborted, true);
  assert.deepEqual(attached?.ocrResult, { status: "FAILED", errorCode: "OCR_TIMEOUT" });
});

test("OCR retry commits its durable preflight before storage and provider work", async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const order: string[] = [];
  let finalized: unknown;
  const storage: PrivateImageStorage = {
    storageProvider: "FAKE_LOCAL",
    async stageAt() { throw new Error("not used"); },
    async read() { order.push("storage-read"); return bytes; },
    async requestDelete() { throw new Error("not used"); },
  };
  const ocr: ScoreboardOcr = {
    async inspect(input) {
      order.push("ocr");
      return {
        schemaVersion: 1,
        provider: "LOCAL_FIXTURE",
        providerRequestReferenceHash: null,
        gameNumber: input.gameNumber,
        needsHumanReview: true,
        participants: [],
      };
    },
  };
  const repository = {
    async reservePrivateImageOcr() {
      order.push("durable-preflight");
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000001",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        gameNumber: 1,
        reference: {
          storageProvider: "FAKE_LOCAL",
          storageKey: "private/scoreboard",
          contentType: "image/png",
          byteSize: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest(),
        },
      } as const;
    },
    async finalizePrivateImageOcr(_envelope: MatchCommandEnvelope, _reservationId: string, result: unknown) {
      order.push("transaction-finalize");
      finalized = result;
      return { body: { submissionId, imageId, revision: 3 }, status: 200, revision: 3, replayed: false };
    },
    async failPrivateImageOcr() { order.push("reservation-failed"); },
  } as unknown as MatchRepository;
  const service = new MatchService(repository, Buffer.alloc(32, 31), storage, ocr);
  const prepared = await service.prepareSubmissionImageOcr(
    adminContext,
    submissionId,
    imageId,
    2,
    {},
  );
  assert.equal(prepared.kind, "RESERVED");
  assert.deepEqual(order, ["durable-preflight"]);
  if (prepared.kind !== "RESERVED") throw new Error("fixture reservation missing");
  await service.finalizeSubmissionImageOcr(
    adminContext,
    prepared,
    submissionId,
    imageId,
    2,
    {},
  );
  assert.deepEqual(order, ["durable-preflight", "storage-read", "ocr", "transaction-finalize"]);
  assert.deepEqual(finalized, {
    status: "SUCCEEDED",
    candidate: {
      schemaVersion: 1,
      provider: "LOCAL_FIXTURE",
      providerRequestReferenceHash: null,
      gameNumber: 1,
      needsHumanReview: true,
      participants: [],
    },
  });
});

test("OCR receipt replay returns before private storage work", async () => {
  let storageReads = 0;
  const repository = {
    async reservePrivateImageOcr() {
      return {
        kind: "REPLAY",
        result: {
          body: { submissionId, imageId, revision: 7 },
          status: 200,
          revision: 7,
          replayed: true,
        },
      } as const;
    },
  } as unknown as MatchRepository;
  const storage: PrivateImageStorage = {
    storageProvider: "FAKE_LOCAL",
    async stageAt() {},
    async read() { storageReads += 1; return null; },
    async requestDelete() {},
  };
  const service = new MatchService(repository, Buffer.alloc(32, 32), storage, null);
  const prepared = await service.prepareSubmissionImageOcr(adminContext, submissionId, imageId, 6, {});
  assert.equal(prepared.kind, "REPLAY");
  assert.equal(storageReads, 0);
});

test("OCR retry deadline aborts the provider and durably finalizes a review-first failure", async () => {
  const bytes = Uint8Array.from([8, 6, 7, 5]);
  let aborted = false;
  let finalized: unknown;
  const storage: PrivateImageStorage = {
    storageProvider: "FAKE_LOCAL",
    async stageAt() {},
    async read() { return bytes; },
    async requestDelete() {},
  };
  const ocr: ScoreboardOcr = {
    async inspect(input) {
      return new Promise((_resolve, reject) => input.signal.addEventListener("abort", () => {
        aborted = true;
        reject(input.signal.reason);
      }, { once: true }));
    },
  };
  const repository = {
    async reservePrivateImageOcr() {
      return {
        kind: "RESERVED",
        reservationId: "60000000-0000-4000-8000-000000000002",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        gameNumber: 1,
        reference: {
          storageProvider: "FAKE_LOCAL",
          storageKey: "private/timeout-scoreboard",
          contentType: "image/png",
          byteSize: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest(),
        },
      } as const;
    },
    async finalizePrivateImageOcr(_envelope: MatchCommandEnvelope, _reservationId: string, result: unknown) {
      finalized = result;
      return { body: { submissionId, imageId, revision: 5 }, status: 200, revision: 5, replayed: false };
    },
    async failPrivateImageOcr() {},
  } as unknown as MatchRepository;
  const service = new MatchService(
    repository,
    Buffer.alloc(32, 33),
    storage,
    ocr,
    { storageStageMs: 50, storageReadMs: 50, storageDeleteMs: 50, ocrMs: 15 },
  );
  const prepared = await service.prepareSubmissionImageOcr(adminContext, submissionId, imageId, 4, {});
  if (prepared.kind !== "RESERVED") throw new Error("fixture reservation missing");
  await service.finalizeSubmissionImageOcr(adminContext, prepared, submissionId, imageId, 4, {});
  assert.equal(aborted, true);
  assert.deepEqual(finalized, { status: "FAILED", errorCode: "OCR_TIMEOUT" });
});
