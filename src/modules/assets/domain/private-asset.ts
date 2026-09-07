import { createHash } from "node:crypto";

export const PRIVATE_ASSET_PURPOSES = [
  "MATCH_SCOREBOARD",
  "INHOUSE_RESULT",
  "DISCIPLINE_ISSUE",
  "DISCIPLINE_RESOLUTION",
  "GALLERY",
  "HIGHLIGHT_THUMBNAIL",
  "SECURITY_INCIDENT_EVIDENCE",
] as const;
export type PrivateAssetPurpose = (typeof PRIVATE_ASSET_PURPOSES)[number];

export const PRIVATE_ASSET_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type PrivateAssetContentType = (typeof PRIVATE_ASSET_CONTENT_TYPES)[number];
export type PrivateAssetStatus = "STAGED" | "READY" | "DELETE_PENDING";
export type PrivateAssetIngestSource = "WEB_USER" | "ADMIN" | "KAKAO_SERVICE" | "JOB";
export type PrivateAssetResourceType =
  | "MATCH_SUBMISSION"
  | "INHOUSE_RESULT"
  | "DISCIPLINE_TASK"
  | "GALLERY_ENTRY"
  | "HIGHLIGHT"
  | "SECURITY_INCIDENT";

export type PrivateAssetRecord = Readonly<{
  id: string;
  createdByUserAccountId: string | null;
  ingestSource: PrivateAssetIngestSource;
  storageProvider: string;
  storageKey: string;
  originalFileName: string | null;
  contentType: PrivateAssetContentType;
  byteSize: number;
  width: number;
  height: number;
  sha256: Uint8Array;
  purpose: PrivateAssetPurpose;
  status: PrivateAssetStatus;
  readyAt: string | null;
  deleteRequestedAt: string | null;
  createdAt: string;
}>;

export type PrivateAssetBinding = Readonly<{
  asset: PrivateAssetRecord;
  resourceType: PrivateAssetResourceType;
  resourceId: string;
  ownerUserAccountId: string | null;
  public: boolean;
}>;

export type PrivateAssetInspection = Readonly<{
  contentType: PrivateAssetContentType;
  width: number;
  height: number;
  pageCount: number;
  decoded: boolean;
}>;

export type ValidatedPrivateAssetUpload = Readonly<{
  bytes: Uint8Array;
  contentType: PrivateAssetContentType;
  byteSize: number;
  width: number;
  height: number;
  sha256: Uint8Array;
  sha256Hex: string;
  originalFileName: string | null;
}>;

export type PrivateAssetListQuery = Readonly<{
  purpose?: PrivateAssetPurpose;
  status?: PrivateAssetStatus;
  resourceType?: PrivateAssetResourceType;
  resourceId?: string;
  createdByUserAccountId?: string;
  cursor?: Readonly<{ createdAt: string; id: string }>;
  pageSize: number;
}>;

/** Internal worker capability. It must never cross an API/DTO boundary or be logged. */
export type PrivateAssetCleanupPlan = Readonly<{
  assetId: string;
  storageProvider: string;
  storageKey: string;
  expectedSha256: Uint8Array;
  requestedAt: string;
}>;

export const PRIVATE_ASSET_ERROR_CODES = [
  "ASSET_NOT_AVAILABLE",
  "DUPLICATE_ASSET",
  "INVALID_INPUT",
  "INVALID_TRANSITION",
  "STORAGE_UNAVAILABLE",
] as const;
export type PrivateAssetErrorCode = (typeof PRIVATE_ASSET_ERROR_CODES)[number];

export class PrivateAssetError extends Error {
  constructor(
    readonly code: PrivateAssetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PrivateAssetError";
  }
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/u;
const SAFE_PROVIDER = /^[A-Z0-9][A-Z0-9_-]{0,31}$/u;
const UNSAFE_TEXT = /[\\/\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
/** Keep server uploads below the Vercel Functions request-body ceiling. */
export const PRIVATE_ASSET_MAX_BYTES = 4 * 1024 * 1024;
export const PRIVATE_ASSET_MAX_PIXELS = 16_777_216;

function assertAsset(condition: unknown, code: PrivateAssetErrorCode, message: string): asserts condition {
  if (!condition) throw new PrivateAssetError(code, message);
}

export function validateAssetIdentifier(value: string, label: string) {
  assertAsset(typeof value === "string" && value === value.trim() && IDENTIFIER.test(value), "INVALID_INPUT", `${label} is invalid.`);
  return value;
}

export function validateAssetInstant(value: string, label: string) {
  const milliseconds = Date.parse(value);
  assertAsset(Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value, "INVALID_INPUT", `${label} must be a canonical ISO instant.`);
  return milliseconds;
}

function detectContentType(bytes: Uint8Array): PrivateAssetContentType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

function exactContainerEnd(bytes: Uint8Array, contentType: PrivateAssetContentType) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (contentType === "image/webp") {
    const declaredLength = bytes.length < 12 ? -1 : (
      bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24)
    ) >>> 0;
    return declaredLength + 8 === bytes.length;
  }
  if (bytes.length < 12) return false;
  const end = bytes.slice(bytes.length - 12);
  return end[0] === 0 && end[1] === 0 && end[2] === 0 && end[3] === 0 &&
    new TextDecoder("ascii").decode(end.slice(4, 8)) === "IEND";
}

function normalizeOriginalFileName(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = value.normalize("NFKC").trim();
  assertAsset(normalized.length >= 1 && normalized.length <= 255 && !UNSAFE_TEXT.test(normalized), "INVALID_INPUT", "originalFileName is unsafe.");
  return normalized;
}

export function validatePrivateAssetUpload(input: Readonly<{
  bytes: Uint8Array;
  declaredContentType: string;
  declaredSha256Hex: string;
  originalFileName?: string | null;
  inspection: PrivateAssetInspection;
}>): ValidatedPrivateAssetUpload {
  assertAsset(
    input.bytes instanceof Uint8Array && input.bytes.byteLength >= 12 && input.bytes.byteLength <= PRIVATE_ASSET_MAX_BYTES,
    "INVALID_INPUT",
    "Asset size must be between 12 bytes and 4 MiB.",
  );
  const detected = detectContentType(input.bytes);
  assertAsset(
    detected !== null &&
      PRIVATE_ASSET_CONTENT_TYPES.includes(input.declaredContentType as PrivateAssetContentType) &&
      detected === input.declaredContentType &&
      detected === input.inspection.contentType &&
      exactContainerEnd(input.bytes, detected),
    "INVALID_INPUT",
    "Declared, detected, and decoded MIME types must match a complete PNG, JPEG, or WebP container.",
  );
  assertAsset(
    input.inspection.decoded === true &&
      input.inspection.pageCount === 1 &&
      Number.isSafeInteger(input.inspection.width) &&
      Number.isSafeInteger(input.inspection.height) &&
      input.inspection.width >= 16 && input.inspection.width <= 4096 &&
      input.inspection.height >= 16 && input.inspection.height <= 4096 &&
      input.inspection.width * input.inspection.height <= PRIVATE_ASSET_MAX_PIXELS,
    "INVALID_INPUT",
    "Asset dimensions must be a decoded single frame between 16 and 4096 pixels per side.",
  );
  assertAsset(/^[0-9a-f]{64}$/u.test(input.declaredSha256Hex), "INVALID_INPUT", "declaredSha256Hex must be lowercase SHA-256.");
  const sha256 = createHash("sha256").update(input.bytes).digest();
  const sha256Hex = sha256.toString("hex");
  assertAsset(sha256Hex === input.declaredSha256Hex, "INVALID_INPUT", "Asset bytes do not match the declared SHA-256.");
  return Object.freeze({
    bytes: input.bytes,
    contentType: detected,
    byteSize: input.bytes.byteLength,
    width: input.inspection.width,
    height: input.inspection.height,
    sha256,
    sha256Hex,
    originalFileName: normalizeOriginalFileName(input.originalFileName),
  });
}

function validateStorageReference(storageProvider: string, storageKey: string) {
  assertAsset(SAFE_PROVIDER.test(storageProvider), "INVALID_INPUT", "storageProvider is invalid.");
  assertAsset(
    storageKey.length >= 1 && storageKey.length <= 255 &&
      !storageKey.startsWith("/") && !storageKey.includes("\\") && !storageKey.split("/").includes("..") &&
      !/[\u0000-\u001f\u007f-\u009f]/u.test(storageKey),
    "INVALID_INPUT",
    "storageKey is invalid.",
  );
}

export function createStagedPrivateAsset(input: Readonly<{
  id: string;
  createdByUserAccountId: string | null;
  ingestSource: PrivateAssetIngestSource;
  storageProvider: string;
  storageKey: string;
  purpose: PrivateAssetPurpose;
  upload: ValidatedPrivateAssetUpload;
  now: string;
}>): PrivateAssetRecord {
  validateAssetIdentifier(input.id, "assetId");
  if (input.createdByUserAccountId !== null) validateAssetIdentifier(input.createdByUserAccountId, "createdByUserAccountId");
  assertAsset(PRIVATE_ASSET_PURPOSES.includes(input.purpose), "INVALID_INPUT", "Private asset purpose is invalid.");
  assertAsset(
    ((input.ingestSource === "WEB_USER" || input.ingestSource === "ADMIN") && input.createdByUserAccountId !== null) ||
      ((input.ingestSource === "KAKAO_SERVICE" || input.ingestSource === "JOB") && input.createdByUserAccountId === null),
    "INVALID_INPUT",
    "Ingest source and creator are inconsistent.",
  );
  validateStorageReference(input.storageProvider, input.storageKey);
  const now = new Date(validateAssetInstant(input.now, "now")).toISOString();
  return Object.freeze({
    id: input.id,
    createdByUserAccountId: input.createdByUserAccountId,
    ingestSource: input.ingestSource,
    storageProvider: input.storageProvider,
    storageKey: input.storageKey,
    originalFileName: input.upload.originalFileName,
    contentType: input.upload.contentType,
    byteSize: input.upload.byteSize,
    width: input.upload.width,
    height: input.upload.height,
    sha256: Uint8Array.from(input.upload.sha256),
    purpose: input.purpose,
    status: "STAGED",
    readyAt: null,
    deleteRequestedAt: null,
    createdAt: now,
  });
}

export function finalizeStagedPrivateAsset(asset: PrivateAssetRecord, now: string) {
  assertAsset(asset.status === "STAGED" && asset.readyAt === null && asset.deleteRequestedAt === null, "INVALID_TRANSITION", "Only a clean STAGED asset can become READY.");
  return Object.freeze({ ...asset, status: "READY" as const, readyAt: new Date(validateAssetInstant(now, "now")).toISOString() });
}

export function requestPrivateAssetDeletion(asset: PrivateAssetRecord, now: string) {
  assertAsset(asset.status !== "DELETE_PENDING", "INVALID_TRANSITION", "Asset deletion is already pending.");
  return Object.freeze({
    ...asset,
    status: "DELETE_PENDING" as const,
    deleteRequestedAt: new Date(validateAssetInstant(now, "now")).toISOString(),
  });
}

export function planPrivateAssetCleanup(assets: readonly PrivateAssetRecord[], limit: number) {
  assertAsset(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, "INVALID_INPUT", "Cleanup limit must be between 1 and 100.");
  return Object.freeze(
    assets
      .filter((asset) => asset.status === "DELETE_PENDING" && asset.deleteRequestedAt !== null)
      .sort((left, right) => left.deleteRequestedAt!.localeCompare(right.deleteRequestedAt!) || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((asset): PrivateAssetCleanupPlan => Object.freeze({
        assetId: asset.id,
        storageProvider: asset.storageProvider,
        storageKey: asset.storageKey,
        expectedSha256: Uint8Array.from(asset.sha256),
        requestedAt: asset.deleteRequestedAt!,
      })),
  );
}

export function validatePrivateAssetListQuery(query: PrivateAssetListQuery): PrivateAssetListQuery {
  assertAsset(Number.isSafeInteger(query.pageSize) && query.pageSize >= 1 && query.pageSize <= 100, "INVALID_INPUT", "Asset pageSize must be between 1 and 100.");
  if (query.purpose !== undefined) assertAsset(PRIVATE_ASSET_PURPOSES.includes(query.purpose), "INVALID_INPUT", "Asset purpose filter is invalid.");
  if (query.status !== undefined) assertAsset(["STAGED", "READY", "DELETE_PENDING"].includes(query.status), "INVALID_INPUT", "Asset status filter is invalid.");
  if (query.resourceType !== undefined) {
    assertAsset([
      "MATCH_SUBMISSION", "INHOUSE_RESULT", "DISCIPLINE_TASK", "GALLERY_ENTRY", "HIGHLIGHT", "SECURITY_INCIDENT",
    ].includes(query.resourceType), "INVALID_INPUT", "Asset resource type filter is invalid.");
  }
  if (query.resourceId !== undefined) validateAssetIdentifier(query.resourceId, "resourceId");
  if (query.createdByUserAccountId !== undefined) validateAssetIdentifier(query.createdByUserAccountId, "createdByUserAccountId");
  if (query.cursor) {
    validateAssetInstant(query.cursor.createdAt, "cursor.createdAt");
    validateAssetIdentifier(query.cursor.id, "cursor.id");
  }
  return query;
}

export function privateAssetDigestEquals(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === 32 && right.byteLength === 32 && left.every((byte, index) => byte === right[index]);
}
