import { createHash } from "node:crypto";

import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { parseLegacyIntegerId } from "@/platform/legacy-identifiers";

import {
  createGallery,
  createHighlight,
  type MediaPublicationStatus,
} from "../domain/media-content";
import type {
  CreateGalleryInput,
  CreateHighlightInput,
  MediaAdminListQuery,
  MediaCommandEnvelope,
  MediaPublicListQuery,
  MediaRepository,
} from "./ports/media-repository";

export const MEDIA_ERROR_CODES = [
  "FORBIDDEN",
  "IDEMPOTENCY_MISMATCH",
  "INVALID_INPUT",
  "INVALID_TRANSITION",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "SESSION_STALE",
] as const;
export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];

export class MediaServiceError extends Error {
  constructor(readonly code: MediaErrorCode, message: string) {
    super(message);
    this.name = "MediaServiceError";
  }
}

export type MediaCommandContext = Readonly<{
  actorSession: TransactionSessionActor;
  idempotencyMaterial: Uint8Array;
  requestId: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const COMMANDS = ["PUBLISH", "UNPUBLISH", "ARCHIVE", "RESTORE"] as const;

function failInput(message = "미디어 요청 값이 올바르지 않습니다."): never {
  throw new MediaServiceError("INVALID_INPUT", message);
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) failInput("미디어 식별자가 올바르지 않습니다.");
  return value.toLocaleLowerCase("en-US");
}

function exactObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) failInput();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(record, key))) failInput();
  return record;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest();
}

function envelope(context: MediaCommandContext, scope: string, request: Record<string, unknown>): MediaCommandEnvelope {
  return {
    actorUserAccountId: context.actorSession.userAccountId,
    actorSession: context.actorSession,
    requestId: uuid(context.requestId),
    scope,
    keyHash: digest(context.idempotencyMaterial),
    requestHash: digest(`${scope}\0${canonical(request)}`),
  };
}

function highlightInput(body: unknown): CreateHighlightInput {
  const value = exactObject(body, ["title", "description", "youtubeUrl", "thumbnailAssetId", "sortOrder"]);
  if (value.thumbnailAssetId !== null) uuid(value.thumbnailAssetId);
  if (typeof value.title !== "string" || typeof value.description !== "string" || typeof value.youtubeUrl !== "string") failInput();
  try {
    const parsed = createHighlight({
      id: "validated-highlight",
      title: value.title,
      description: value.description,
      youtubeUrl: value.youtubeUrl,
      thumbnailAssetId: value.thumbnailAssetId as string | null,
      sortOrder: value.sortOrder as number,
    });
    return {
      title: parsed.title,
      description: parsed.description,
      youtubeId: parsed.youtubeId,
      thumbnailAssetId: parsed.thumbnailAssetId,
      sortOrder: parsed.sortOrder,
    };
  } catch {
    failInput("제목, 설명, YouTube 주소와 썸네일을 확인해 주세요.");
  }
}

function galleryInput(body: unknown, allowEmptyDraft = false): CreateGalleryInput {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) failInput();
  const value = body as Record<string, unknown>;
  const allowed = ["title", "description", "imageAssetIds", "externalImageUrls", "imageOrder"];
  if (Object.keys(value).some((key) => !allowed.includes(key)) ||
    !["title", "description", "imageAssetIds"].every((key) => Object.hasOwn(value, key))) failInput();
  if (!Array.isArray(value.imageAssetIds)) failInput("갤러리 이미지는 1~5개여야 합니다.");
  if (typeof value.title !== "string" || typeof value.description !== "string") failInput();
  const imageAssetIds = value.imageAssetIds.map(uuid);
  const externalImageUrls = value.externalImageUrls === undefined ? undefined : Array.isArray(value.externalImageUrls) && value.externalImageUrls.every((url) => typeof url === "string")
    ? value.externalImageUrls as string[]
    : failInput("외부 이미지 주소를 확인해 주세요.");
  const imageOrder = value.imageOrder === undefined ? undefined : Array.isArray(value.imageOrder)
    ? value.imageOrder.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.getPrototypeOf(entry) !== Object.prototype) failInput("갤러리 이미지 순서를 확인해 주세요.");
      const item = entry as Record<string, unknown>;
      if (item.kind === "ASSET" && typeof item.assetId === "string" && Object.keys(item).length === 2) {
        return { kind: "ASSET" as const, assetId: uuid(item.assetId) };
      }
      if (item.kind === "EXTERNAL" && typeof item.url === "string" && Object.keys(item).length === 2) {
        return { kind: "EXTERNAL" as const, url: item.url };
      }
      return failInput("갤러리 이미지 순서를 확인해 주세요.");
    })
    : failInput("갤러리 이미지 순서를 확인해 주세요.");
  try {
    const parsed = createGallery({
      id: "validated-gallery",
      title: value.title,
      description: value.description,
      imageAssetIds,
      externalImageUrls,
      imageOrder,
      allowEmptyDraft,
    });
    return {
      title: parsed.title,
      description: parsed.description,
      imageAssetIds: parsed.imageAssetIds,
      ...(value.externalImageUrls === undefined ? {} : { externalImageUrls: parsed.externalImageUrls }),
      ...(value.imageOrder === undefined ? {} : { imageOrder: parsed.imageOrder }),
    };
  } catch {
    failInput("제목, 설명과 중복되지 않은 이미지 1~5개를 확인해 주세요.");
  }
}

function transitionBody(body: unknown) {
  const value = exactObject(body, ["action"]);
  if (!COMMANDS.includes(value.action as never)) failInput("게시 상태 명령이 올바르지 않습니다.");
  return value.action as (typeof COMMANDS)[number];
}

function emptyBody(body: unknown) {
  exactObject(body, []);
}

export function parseMediaPublicListQuery(url: string): MediaPublicListQuery | null {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => key !== "pageSize" && key !== "cursor")) return null;
  if (["pageSize", "cursor"].some((key) => params.getAll(key).length > 1)) return null;
  const pageSizeRaw = params.get("pageSize") ?? "12";
  if (!/^(?:[1-9]|1[0-9]|2[0-4])$/u.test(pageSizeRaw)) return null;
  const cursor = params.get("cursor");
  if (cursor !== null && (!/^[A-Za-z0-9_-]{8,500}$/u.test(cursor) || params.getAll("cursor").length !== 1)) return null;
  return { pageSize: Number(pageSizeRaw), cursor };
}

export function parseMediaAdminListQuery(url: string): MediaAdminListQuery | null {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => !["page", "pageSize", "status"].includes(key))) return null;
  if (["page", "pageSize", "status"].some((key) => params.getAll(key).length > 1)) return null;
  const page = params.get("page") ?? "1";
  const pageSize = params.get("pageSize") ?? "20";
  const status = params.get("status");
  if (!/^[1-9][0-9]{0,2}$/u.test(page) || Number(page) > 100 || !/^(?:[1-9]|[1-4][0-9]|50)$/u.test(pageSize)) return null;
  if (status !== null && !STATUSES.includes(status as MediaPublicationStatus)) return null;
  return { page: Number(page), pageSize: Number(pageSize), status: status as MediaPublicationStatus | null };
}

export class MediaService {
  constructor(private readonly repository: MediaRepository) {}

  listPublicHighlights(query: MediaPublicListQuery) { return this.repository.listPublicHighlights(query); }
  listPublicGalleries(query: MediaPublicListQuery) { return this.repository.listPublicGalleries(query); }
  getPublicHighlight(id: string) { return this.repository.getPublicHighlight(uuid(id)); }
  getPublicGallery(id: string) { return this.repository.getPublicGallery(uuid(id)); }
  resolvePublicHighlightLegacyId(value: unknown) {
    const legacyId = parseLegacyIntegerId(value);
    return legacyId === null ? Promise.resolve(null) : this.repository.findPublicHighlightUuidByLegacyId(legacyId);
  }
  resolvePublicGalleryLegacyId(value: unknown) {
    const legacyId = parseLegacyIntegerId(value);
    return legacyId === null ? Promise.resolve(null) : this.repository.findPublicGalleryUuidByLegacyId(legacyId);
  }
  listAdminHighlights(query: MediaAdminListQuery) { return this.repository.listAdminHighlights(query); }
  listAdminGalleries(query: MediaAdminListQuery) { return this.repository.listAdminGalleries(query); }
  getAdminHighlight(id: string) { return this.repository.getAdminHighlight(uuid(id)); }
  getAdminGallery(id: string) { return this.repository.getAdminGallery(uuid(id)); }

  createHighlight(context: MediaCommandContext, expectedRevision: number, body: unknown, now = new Date()) {
    if (expectedRevision !== 0) throw new MediaServiceError("PRECONDITION_FAILED", "새 하이라이트는 revision 0에서 시작합니다.");
    const input = highlightInput(body);
    return this.repository.createHighlight(envelope(context, "media:highlights:create", input), input, now);
  }

  updateHighlight(context: MediaCommandContext, id: string, expectedRevision: number, body: unknown, now = new Date()) {
    const input = highlightInput(body); const highlightId = uuid(id);
    return this.repository.updateHighlight(envelope(context, "media:highlights:update", { highlightId, expectedRevision, input }), highlightId, expectedRevision, input, now);
  }

  transitionHighlight(context: MediaCommandContext, id: string, expectedRevision: number, body: unknown, now = new Date()) {
    const command = transitionBody(body); const highlightId = uuid(id);
    return this.repository.transitionHighlight(envelope(context, `media:highlights:${command.toLowerCase()}`, { highlightId, expectedRevision, command }), highlightId, expectedRevision, command, now);
  }

  archiveHighlight(context: MediaCommandContext, id: string, expectedRevision: number, body: unknown, now = new Date()) {
    emptyBody(body); const highlightId = uuid(id);
    return this.repository.transitionHighlight(envelope(context, "media:highlights:archive", { highlightId, expectedRevision }), highlightId, expectedRevision, "ARCHIVE", now);
  }

  createGallery(context: MediaCommandContext, expectedRevision: number, body: unknown, now = new Date()) {
    if (expectedRevision !== 0) throw new MediaServiceError("PRECONDITION_FAILED", "새 갤러리는 revision 0에서 시작합니다.");
    const input = galleryInput(body, true);
    return this.repository.createGallery(envelope(context, "media:galleries:create", input), input, now);
  }

  updateGallery(context: MediaCommandContext, id: string, expectedRevision: number, body: unknown, now = new Date()) {
    const input = galleryInput(body, true); const galleryId = uuid(id);
    return this.repository.updateGallery(envelope(context, "media:galleries:update", { galleryId, expectedRevision, input }), galleryId, expectedRevision, input, now);
  }

  transitionGallery(context: MediaCommandContext, id: string, expectedRevision: number, body: unknown, now = new Date()) {
    const command = transitionBody(body); const galleryId = uuid(id);
    return this.repository.transitionGallery(envelope(context, `media:galleries:${command.toLowerCase()}`, { galleryId, expectedRevision, command }), galleryId, expectedRevision, command, now);
  }

  archiveGallery(context: MediaCommandContext, id: string, expectedRevision: number, body: unknown, now = new Date()) {
    emptyBody(body); const galleryId = uuid(id);
    return this.repository.transitionGallery(envelope(context, "media:galleries:archive", { galleryId, expectedRevision }), galleryId, expectedRevision, "ARCHIVE", now);
  }

  setGalleryHomeDisplay(context: MediaCommandContext, id: string, expectedRevision: number, body: unknown, now = new Date()) {
    const value = exactObject(body, ["showOnHome"]);
    if (typeof value.showOnHome !== "boolean") failInput("홈 노출 값이 올바르지 않습니다.");
    const galleryId = uuid(id);
    return this.repository.setGalleryHomeDisplay(envelope(context, "media:galleries:home-display", { galleryId, expectedRevision, showOnHome: value.showOnHome }), galleryId, expectedRevision, value.showOnHome, now);
  }
}
