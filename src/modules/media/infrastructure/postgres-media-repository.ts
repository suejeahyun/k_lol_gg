import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import {
  ADMIN_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import {
  mediaCommandReceipts,
  mediaGalleries,
  mediaGalleryAssets,
  mediaHighlights,
  mediaOutbox,
} from "@/platform/db/schema/media";
import { privateAssets } from "@/platform/db/schema/matches";
import type { V2Database } from "@/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type {
  CreateGalleryInput,
  CreateHighlightInput,
  MediaAdminListQuery,
  MediaCommandEnvelope,
  MediaMutationResult,
  MediaPublicListQuery,
  MediaRepository,
} from "../application/ports/media-repository";
import { MediaServiceError } from "../application/media-service";
import {
  setGalleryHomeDisplay,
  transitionMediaStatus,
  updateGallery,
  updateHighlight,
  type GalleryContent,
  type HighlightContent,
} from "../domain/media-content";

type HighlightRow = typeof mediaHighlights.$inferSelect;
type GalleryRow = typeof mediaGalleries.$inferSelect;
type SuccessfulMutation = Omit<MediaMutationResult, "replayed">;
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

function postgresDetails(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code && /^[0-9A-Z]{5}$/u.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return {};
}

function rethrowMediaError(error: unknown): never {
  if (error instanceof MediaServiceError) throw error;
  const detail = postgresDetails(error);
  if (detail.code === "23505" || detail.code === "23514" || detail.code === "23503") {
    throw new MediaServiceError("INVALID_TRANSITION", "미디어 상태 또는 자산 연결이 충돌했습니다.");
  }
  throw error;
}

function highlightFromRow(row: HighlightRow): HighlightContent {
  return {
    id: row.id,
    revision: row.revision,
    title: row.title,
    description: row.description,
    youtubeId: row.youtubeId,
    thumbnailAssetId: row.thumbnailAssetId,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

function galleryFromRow(row: GalleryRow, imageAssetIds: readonly string[]): GalleryContent {
  return {
    id: row.id,
    revision: row.revision,
    title: row.title,
    description: row.description,
    imageAssetIds,
    showOnHome: row.showOnHome,
    status: row.status,
  };
}

function snapshot(content: HighlightContent | GalleryContent) {
  return { ...content } as Record<string, unknown>;
}

function encodeCursor(parts: readonly (string | number)[]) {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

function decodeHighlightCursor(cursor: string | null): readonly [number, string] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || typeof value[1] !== "string") throw new Error();
    return [value[0], value[1]];
  } catch {
    throw new MediaServiceError("INVALID_INPUT", "하이라이트 페이지 커서가 올바르지 않습니다.");
  }
}

function decodeGalleryCursor(cursor: string | null): readonly [Date, string] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string" || typeof value[1] !== "string") throw new Error();
    const date = new Date(value[0]);
    if (!Number.isFinite(date.valueOf()) || date.toISOString() !== value[0]) throw new Error();
    return [date, value[1]];
  } catch {
    throw new MediaServiceError("INVALID_INPUT", "갤러리 페이지 커서가 올바르지 않습니다.");
  }
}

async function existingReceipt(executor: DatabaseExecutor, envelope: MediaCommandEnvelope): Promise<MediaMutationResult | null> {
  const receipt = (await executor.select().from(mediaCommandReceipts).where(and(
    eq(mediaCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
    eq(mediaCommandReceipts.scope, envelope.scope),
    eq(mediaCommandReceipts.keyHash, envelope.keyHash),
    sql<boolean>`${mediaCommandReceipts.expiresAt} > clock_timestamp()`,
  )).limit(1))[0];
  if (!receipt) return null;
  if (!Buffer.from(receipt.requestHash).equals(envelope.requestHash)) {
    throw new MediaServiceError("IDEMPOTENCY_MISMATCH", "같은 멱등성 키가 다른 미디어 요청에 사용되었습니다.");
  }
  const revision = receipt.responseJson.revision;
  if (typeof revision !== "number") throw new Error("Stored media receipt has no revision.");
  return { body: receipt.responseJson, status: receipt.responseStatus, revision, replayed: true };
}

async function appendEvidence(
  transaction: V2Transaction,
  envelope: MediaCommandEnvelope,
  aggregateType: "HIGHLIGHT" | "GALLERY",
  action: string,
  before: Record<string, unknown> | null,
  after: HighlightContent | GalleryContent,
) {
  await transaction.insert(auditEvents).values({
    requestId: envelope.requestId,
    actorUserAccountId: envelope.actorUserAccountId,
    action,
    targetType: aggregateType,
    targetId: after.id,
    beforeJson: before,
    afterJson: snapshot(after),
  });
  await transaction.insert(mediaOutbox).values({
    id: randomUUID(),
    aggregateType,
    aggregateId: after.id,
    aggregateRevision: after.revision,
    requestId: envelope.requestId,
    eventType: action,
    payloadJson: { id: after.id, revision: after.revision, status: after.status },
  });
}

async function imageIds(executor: DatabaseExecutor, galleryId: string) {
  return (await executor.select({ id: mediaGalleryAssets.privateAssetId }).from(mediaGalleryAssets)
    .where(eq(mediaGalleryAssets.galleryId, galleryId)).orderBy(asc(mediaGalleryAssets.ordinal))).map((row) => row.id);
}

async function assertReadyAssets(
  executor: DatabaseExecutor,
  ids: readonly string[],
  purpose: "GALLERY" | "HIGHLIGHT_THUMBNAIL",
) {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  const rows = await executor.select({ id: privateAssets.id }).from(privateAssets).where(and(
    inArray(privateAssets.id, unique),
    eq(privateAssets.status, "READY"),
    eq(privateAssets.purpose, purpose),
  )).for("update");
  if (rows.length !== unique.length) {
    throw new MediaServiceError("INVALID_INPUT", "READY 상태이며 목적이 일치하는 비공개 자산만 연결할 수 있습니다.");
  }
}

export class PostgresMediaRepository implements MediaRepository {
  constructor(private readonly database: V2Database) {}

  private async idempotent(envelope: MediaCommandEnvelope, work: (transaction: V2Transaction) => Promise<SuccessfulMutation>) {
    try {
      return await withTransaction(this.database, async (transaction): Promise<MediaMutationResult> => {
        if (envelope.actorUserAccountId !== envelope.actorSession.userAccountId ||
          !(await lockTransactionSessionActor(transaction, envelope.actorSession, new Date(), ADMIN_MUTATION_SESSION_POLICY))) {
          throw new MediaServiceError("SESSION_STALE", "관리자 세션을 다시 확인해 주세요.");
        }
        const lockKey = `${envelope.actorUserAccountId}:${envelope.scope}:${envelope.keyHash.toString("hex")}`;
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
        await transaction.delete(mediaCommandReceipts).where(and(
          eq(mediaCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
          eq(mediaCommandReceipts.scope, envelope.scope),
          eq(mediaCommandReceipts.keyHash, envelope.keyHash),
          sql<boolean>`${mediaCommandReceipts.expiresAt} <= clock_timestamp()`,
        ));
        const replay = await existingReceipt(transaction, envelope);
        if (replay) return replay;
        const receiptId = randomUUID();
        await transaction.insert(mediaCommandReceipts).values({
          id: receiptId,
          actorUserAccountId: envelope.actorUserAccountId,
          scope: envelope.scope,
          keyHash: envelope.keyHash,
          requestHash: envelope.requestHash,
          responseStatus: 202,
          responseJson: { pending: true },
          createdAt: sql`clock_timestamp()`,
          expiresAt: sql`clock_timestamp() + (${RECEIPT_TTL_MS} * interval '1 millisecond')`,
        });
        const result = await work(transaction);
        await transaction.update(mediaCommandReceipts).set({
          responseStatus: result.status,
          responseJson: result.body,
          responseEtag: `"${result.revision}"`,
        }).where(eq(mediaCommandReceipts.id, receiptId));
        return { ...result, replayed: false };
      });
    } catch (error) {
      rethrowMediaError(error);
    }
  }

  async listPublicHighlights(query: MediaPublicListQuery) {
    const cursor = decodeHighlightCursor(query.cursor);
    const assetReady = or(
      isNull(mediaHighlights.thumbnailAssetId),
      sql<boolean>`exists (
        select 1 from "assets"."private_assets" pa
        where pa."id" = ${mediaHighlights.thumbnailAssetId}
          and pa."status" = 'READY' and pa."purpose" = 'HIGHLIGHT_THUMBNAIL'
      )`,
    );
    const rows = await this.database.select().from(mediaHighlights).where(and(
      eq(mediaHighlights.status, "PUBLISHED"), assetReady,
      cursor ? or(gt(mediaHighlights.sortOrder, cursor[0]), and(eq(mediaHighlights.sortOrder, cursor[0]), gt(mediaHighlights.id, cursor[1]))) : undefined,
    )).orderBy(asc(mediaHighlights.sortOrder), asc(mediaHighlights.id)).limit(query.pageSize + 1);
    const page = rows.slice(0, query.pageSize);
    const last = page.at(-1);
    return {
      items: page.map(highlightFromRow),
      nextCursor: rows.length > query.pageSize && last ? encodeCursor([last.sortOrder, last.id]) : null,
    };
  }

  async getPublicHighlight(id: string) {
    const row = (await this.database.select().from(mediaHighlights).where(and(
      eq(mediaHighlights.id, id), eq(mediaHighlights.status, "PUBLISHED"),
      or(isNull(mediaHighlights.thumbnailAssetId), sql<boolean>`exists (
        select 1 from "assets"."private_assets" pa where pa."id" = ${mediaHighlights.thumbnailAssetId}
        and pa."status" = 'READY' and pa."purpose" = 'HIGHLIGHT_THUMBNAIL'
      )`),
    )).limit(1))[0];
    return row ? highlightFromRow(row) : null;
  }

  async listPublicGalleries(query: MediaPublicListQuery) {
    const cursor = decodeGalleryCursor(query.cursor);
    const validAssets = sql<boolean>`exists (
      select 1 from "media"."gallery_assets" ga where ga."gallery_id" = ${mediaGalleries.id}
    ) and not exists (
      select 1 from "media"."gallery_assets" ga
      left join "assets"."private_assets" pa on pa."id" = ga."private_asset_id"
      where ga."gallery_id" = ${mediaGalleries.id}
        and (pa."id" is null or pa."status" <> 'READY' or pa."purpose" <> 'GALLERY')
    )`;
    const rows = await this.database.select().from(mediaGalleries).where(and(
      eq(mediaGalleries.status, "PUBLISHED"), validAssets,
      cursor ? or(lt(mediaGalleries.publishedAt, cursor[0]), and(eq(mediaGalleries.publishedAt, cursor[0]), lt(mediaGalleries.id, cursor[1]))) : undefined,
    )).orderBy(desc(mediaGalleries.publishedAt), desc(mediaGalleries.id)).limit(query.pageSize + 1);
    const page = rows.slice(0, query.pageSize);
    const items = await Promise.all(page.map(async (row) => galleryFromRow(row, await imageIds(this.database, row.id))));
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > query.pageSize && last?.publishedAt ? encodeCursor([last.publishedAt.toISOString(), last.id]) : null,
    };
  }

  async getPublicGallery(id: string) {
    const row = (await this.database.select().from(mediaGalleries).where(and(
      eq(mediaGalleries.id, id), eq(mediaGalleries.status, "PUBLISHED"),
      sql<boolean>`exists (select 1 from "media"."gallery_assets" ga where ga."gallery_id" = ${mediaGalleries.id})`,
      sql<boolean>`not exists (
        select 1 from "media"."gallery_assets" ga left join "assets"."private_assets" pa on pa."id" = ga."private_asset_id"
        where ga."gallery_id" = ${mediaGalleries.id} and (pa."id" is null or pa."status" <> 'READY' or pa."purpose" <> 'GALLERY')
      )`,
    )).limit(1))[0];
    return row ? galleryFromRow(row, await imageIds(this.database, row.id)) : null;
  }

  async listAdminHighlights(query: MediaAdminListQuery) {
    const predicate = query.status ? eq(mediaHighlights.status, query.status) : undefined;
    const totalCount = (await this.database.select({ value: count() }).from(mediaHighlights).where(predicate))[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const currentPage = Math.min(query.page, totalPages);
    const rows = await this.database.select().from(mediaHighlights).where(predicate).orderBy(desc(mediaHighlights.updatedAt), desc(mediaHighlights.id)).limit(query.pageSize).offset((currentPage - 1) * query.pageSize);
    return { items: rows.map(highlightFromRow), totalCount, totalPages, currentPage, pageSize: query.pageSize };
  }

  async getAdminHighlight(id: string) {
    const row = (await this.database.select().from(mediaHighlights).where(eq(mediaHighlights.id, id)).limit(1))[0];
    return row ? highlightFromRow(row) : null;
  }

  async listAdminGalleries(query: MediaAdminListQuery) {
    const predicate = query.status ? eq(mediaGalleries.status, query.status) : undefined;
    const totalCount = (await this.database.select({ value: count() }).from(mediaGalleries).where(predicate))[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const currentPage = Math.min(query.page, totalPages);
    const rows = await this.database.select().from(mediaGalleries).where(predicate).orderBy(desc(mediaGalleries.updatedAt), desc(mediaGalleries.id)).limit(query.pageSize).offset((currentPage - 1) * query.pageSize);
    const items = await Promise.all(rows.map(async (row) => galleryFromRow(row, await imageIds(this.database, row.id))));
    return { items, totalCount, totalPages, currentPage, pageSize: query.pageSize };
  }

  async getAdminGallery(id: string) {
    const row = (await this.database.select().from(mediaGalleries).where(eq(mediaGalleries.id, id)).limit(1))[0];
    return row ? galleryFromRow(row, await imageIds(this.database, row.id)) : null;
  }

  async createHighlight(envelope: MediaCommandEnvelope, input: CreateHighlightInput, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      if (input.thumbnailAssetId) await assertReadyAssets(transaction, [input.thumbnailAssetId], "HIGHLIGHT_THUMBNAIL");
      const row = (await transaction.insert(mediaHighlights).values({
        id: randomUUID(), ...input, status: "DRAFT", revision: 0,
        createdByUserAccountId: envelope.actorUserAccountId, updatedByUserAccountId: envelope.actorUserAccountId,
        createdAt: now, updatedAt: now,
      }).returning())[0];
      if (!row) throw new Error("MEDIA_HIGHLIGHT_INSERT_FAILED");
      const content = highlightFromRow(row);
      await appendEvidence(transaction, envelope, "HIGHLIGHT", "MEDIA_HIGHLIGHT_CREATED", null, content);
      return { body: { highlight: content, revision: content.revision }, status: 201, revision: content.revision };
    });
  }

  async updateHighlight(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, input: CreateHighlightInput, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      const row = await this.lockHighlight(transaction, id);
      if (!row) throw new MediaServiceError("NOT_FOUND", "하이라이트를 찾을 수 없습니다.");
      if (input.thumbnailAssetId) await assertReadyAssets(transaction, [input.thumbnailAssetId], "HIGHLIGHT_THUMBNAIL");
      let next: HighlightContent;
      try { next = updateHighlight({ highlight: highlightFromRow(row), expectedRevision, ...input, youtubeUrl: input.youtubeId }); }
      catch (error) { this.rethrowDomain(error); }
      const updated = (await transaction.update(mediaHighlights).set({
        title: next!.title, description: next!.description, youtubeId: next!.youtubeId,
        thumbnailAssetId: next!.thumbnailAssetId, sortOrder: next!.sortOrder, revision: next!.revision,
        updatedByUserAccountId: envelope.actorUserAccountId, updatedAt: now,
      }).where(and(eq(mediaHighlights.id, id), eq(mediaHighlights.revision, expectedRevision))).returning())[0];
      if (!updated) throw new MediaServiceError("PRECONDITION_FAILED", "하이라이트 revision이 변경되었습니다.");
      const content = highlightFromRow(updated);
      await appendEvidence(transaction, envelope, "HIGHLIGHT", "MEDIA_HIGHLIGHT_UPDATED", snapshot(highlightFromRow(row)), content);
      return { body: { highlight: content, revision: content.revision }, status: 200, revision: content.revision };
    });
  }

  async transitionHighlight(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, command: "PUBLISH" | "UNPUBLISH" | "ARCHIVE" | "RESTORE", now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      const row = await this.lockHighlight(transaction, id);
      if (!row) throw new MediaServiceError("NOT_FOUND", "하이라이트를 찾을 수 없습니다.");
      if (command === "PUBLISH" && row.thumbnailAssetId) await assertReadyAssets(transaction, [row.thumbnailAssetId], "HIGHLIGHT_THUMBNAIL");
      let next: HighlightContent;
      try { next = transitionMediaStatus({ content: highlightFromRow(row), expectedRevision, command }); }
      catch (error) { this.rethrowDomain(error); }
      const dates = this.lifecycleDates(command, row.publishedAt, now);
      const updated = (await transaction.update(mediaHighlights).set({
        status: next!.status, revision: next!.revision, ...dates,
        updatedByUserAccountId: envelope.actorUserAccountId, updatedAt: now,
      }).where(and(eq(mediaHighlights.id, id), eq(mediaHighlights.revision, expectedRevision))).returning())[0];
      if (!updated) throw new MediaServiceError("PRECONDITION_FAILED", "하이라이트 revision이 변경되었습니다.");
      const content = highlightFromRow(updated);
      await appendEvidence(transaction, envelope, "HIGHLIGHT", `MEDIA_HIGHLIGHT_${command}`, snapshot(highlightFromRow(row)), content);
      return { body: { highlight: content, revision: content.revision }, status: 200, revision: content.revision };
    });
  }

  async createGallery(envelope: MediaCommandEnvelope, input: CreateGalleryInput, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      await assertReadyAssets(transaction, input.imageAssetIds, "GALLERY");
      const row = (await transaction.insert(mediaGalleries).values({
        id: randomUUID(), title: input.title, description: input.description, status: "DRAFT", revision: 0,
        createdByUserAccountId: envelope.actorUserAccountId, updatedByUserAccountId: envelope.actorUserAccountId,
        createdAt: now, updatedAt: now,
      }).returning())[0];
      if (!row) throw new Error("MEDIA_GALLERY_INSERT_FAILED");
      await this.replaceGalleryAssets(transaction, row.id, input.imageAssetIds);
      const content = galleryFromRow(row, input.imageAssetIds);
      await appendEvidence(transaction, envelope, "GALLERY", "MEDIA_GALLERY_CREATED", null, content);
      return { body: { gallery: content, revision: content.revision }, status: 201, revision: content.revision };
    });
  }

  async updateGallery(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, input: CreateGalleryInput, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      const row = await this.lockGallery(transaction, id);
      if (!row) throw new MediaServiceError("NOT_FOUND", "갤러리를 찾을 수 없습니다.");
      await assertReadyAssets(transaction, input.imageAssetIds, "GALLERY");
      const current = galleryFromRow(row, await imageIds(transaction, id));
      let next: GalleryContent;
      try { next = updateGallery({ gallery: current, expectedRevision, ...input }); }
      catch (error) { this.rethrowDomain(error); }
      const updated = (await transaction.update(mediaGalleries).set({
        title: next!.title, description: next!.description, revision: next!.revision,
        updatedByUserAccountId: envelope.actorUserAccountId, updatedAt: now,
      }).where(and(eq(mediaGalleries.id, id), eq(mediaGalleries.revision, expectedRevision))).returning())[0];
      if (!updated) throw new MediaServiceError("PRECONDITION_FAILED", "갤러리 revision이 변경되었습니다.");
      await this.replaceGalleryAssets(transaction, id, next!.imageAssetIds);
      const content = galleryFromRow(updated, next!.imageAssetIds);
      await appendEvidence(transaction, envelope, "GALLERY", "MEDIA_GALLERY_UPDATED", snapshot(current), content);
      return { body: { gallery: content, revision: content.revision }, status: 200, revision: content.revision };
    });
  }

  async transitionGallery(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, command: "PUBLISH" | "UNPUBLISH" | "ARCHIVE" | "RESTORE", now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      const row = await this.lockGallery(transaction, id);
      if (!row) throw new MediaServiceError("NOT_FOUND", "갤러리를 찾을 수 없습니다.");
      const current = galleryFromRow(row, await imageIds(transaction, id));
      if (command === "PUBLISH") await assertReadyAssets(transaction, current.imageAssetIds, "GALLERY");
      let next: GalleryContent;
      try { next = transitionMediaStatus({ content: current, expectedRevision, command }); }
      catch (error) { this.rethrowDomain(error); }
      const dates = this.lifecycleDates(command, row.publishedAt, now);
      const updated = (await transaction.update(mediaGalleries).set({
        status: next!.status, revision: next!.revision, showOnHome: next!.showOnHome, ...dates,
        updatedByUserAccountId: envelope.actorUserAccountId, updatedAt: now,
      }).where(and(eq(mediaGalleries.id, id), eq(mediaGalleries.revision, expectedRevision))).returning())[0];
      if (!updated) throw new MediaServiceError("PRECONDITION_FAILED", "갤러리 revision이 변경되었습니다.");
      const content = galleryFromRow(updated, current.imageAssetIds);
      await appendEvidence(transaction, envelope, "GALLERY", `MEDIA_GALLERY_${command}`, snapshot(current), content);
      return { body: { gallery: content, revision: content.revision }, status: 200, revision: content.revision };
    });
  }

  async setGalleryHomeDisplay(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, showOnHome: boolean, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      const row = await this.lockGallery(transaction, id);
      if (!row) throw new MediaServiceError("NOT_FOUND", "갤러리를 찾을 수 없습니다.");
      const current = galleryFromRow(row, await imageIds(transaction, id));
      let next: GalleryContent;
      try { next = setGalleryHomeDisplay({ gallery: current, expectedRevision, showOnHome }); }
      catch (error) { this.rethrowDomain(error); }
      const updated = (await transaction.update(mediaGalleries).set({
        showOnHome: next!.showOnHome, revision: next!.revision,
        updatedByUserAccountId: envelope.actorUserAccountId, updatedAt: now,
      }).where(and(eq(mediaGalleries.id, id), eq(mediaGalleries.revision, expectedRevision))).returning())[0];
      if (!updated) throw new MediaServiceError("PRECONDITION_FAILED", "갤러리 revision이 변경되었습니다.");
      const content = galleryFromRow(updated, current.imageAssetIds);
      await appendEvidence(transaction, envelope, "GALLERY", "MEDIA_GALLERY_HOME_DISPLAY_SET", snapshot(current), content);
      return { body: { gallery: content, revision: content.revision }, status: 200, revision: content.revision };
    });
  }

  private async lockHighlight(transaction: V2Transaction, id: string) {
    return (await transaction.select().from(mediaHighlights).where(eq(mediaHighlights.id, id)).for("update").limit(1))[0] ?? null;
  }

  private async lockGallery(transaction: V2Transaction, id: string) {
    return (await transaction.select().from(mediaGalleries).where(eq(mediaGalleries.id, id)).for("update").limit(1))[0] ?? null;
  }

  private async replaceGalleryAssets(transaction: V2Transaction, galleryId: string, ids: readonly string[]) {
    await transaction.delete(mediaGalleryAssets).where(eq(mediaGalleryAssets.galleryId, galleryId));
    if (ids.length > 0) {
      await transaction.insert(mediaGalleryAssets).values(ids.map((privateAssetId, ordinal) => ({ galleryId, privateAssetId, ordinal })));
    }
  }

  private lifecycleDates(command: "PUBLISH" | "UNPUBLISH" | "ARCHIVE" | "RESTORE", previousPublishedAt: Date | null, now: Date) {
    if (command === "PUBLISH") return { publishedAt: now, archivedAt: null };
    if (command === "UNPUBLISH" || command === "RESTORE") return { publishedAt: null, archivedAt: null };
    return { publishedAt: previousPublishedAt, archivedAt: now };
  }

  private rethrowDomain(error: unknown): never {
    const message = error instanceof Error ? error.message : "";
    if (message === "STALE_MEDIA_REVISION") throw new MediaServiceError("PRECONDITION_FAILED", "미디어 revision이 변경되었습니다.");
    if (message.startsWith("INVALID_") || message === "ARCHIVED_MEDIA_READ_ONLY" || message === "UNPUBLISHED_GALLERY_CANNOT_SHOW_ON_HOME") {
      throw new MediaServiceError("INVALID_TRANSITION", "현재 게시 상태에서는 요청한 변경을 할 수 없습니다.");
    }
    throw error;
  }
}
