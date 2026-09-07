import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import type { PrivateAssetHumanActor } from "@/modules/assets/application/private-asset-policy";
import {
  PRIVATE_ASSET_CONTENT_TYPES,
  PRIVATE_ASSET_MAX_BYTES,
  PRIVATE_ASSET_PURPOSES,
  PrivateAssetError,
  validatePrivateAssetListQuery,
  type PrivateAssetListQuery,
  type PrivateAssetPurpose,
  type PrivateAssetResourceType,
  type PrivateAssetStatus,
} from "@/modules/assets/domain/private-asset";
import {
  definePublicProblem,
  noStoreJsonResponse,
  noStoreSecurityHeaders,
  problemResponse,
  readIfMatchRevision,
  readValidatedTraceId,
} from "@/platform/http";

const RESOURCE_TYPES = ["MATCH_SUBMISSION", "INHOUSE_RESULT", "DISCIPLINE_TASK", "GALLERY_ENTRY", "HIGHLIGHT", "SECURITY_INCIDENT"] as const;
const STATUSES = ["STAGED", "READY", "DELETE_PENDING"] as const;

const problems = Object.freeze({
  conflict: definePublicProblem({ code: "DUPLICATE_ASSET", status: 409, title: "같은 이미지가 이미 있습니다.", detail: "이 초안에 업로드된 기존 이미지를 선택해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_ASSET_INPUT", status: 400, title: "이미지 요청이 올바르지 않습니다.", detail: "PNG, JPEG, WebP 단일 이미지와 크기 제한을 확인해 주세요." }),
  notFound: definePublicProblem({ code: "ASSET_NOT_AVAILABLE", status: 404, title: "자산을 찾을 수 없습니다.", detail: "주소와 접근 권한을 확인해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 관리자 사이트에서 다시 요청해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "초안이 먼저 변경되었습니다.", detail: "편집 화면을 새로고침한 뒤 다시 시도해 주세요." }),
  storage: definePublicProblem({ code: "PRIVATE_STORAGE_UNAVAILABLE", status: 503, title: "이미지 저장소를 사용할 수 없습니다.", detail: "운영 저장소가 연결될 때까지 업로드와 원본 읽기는 닫혀 있습니다." }),
  unavailable: definePublicProblem({ code: "PRIVATE_ASSET_SERVICE_UNAVAILABLE", status: 503, title: "비공개 자산 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
});

function decodedFileName(value: string | null) {
  if (!value) return null;
  if (value.length > 768 || !/^[\x21-\x7e]+$/u.test(value)) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length >= 1 && decoded.length <= 255 ? decoded : undefined;
  } catch { return undefined; }
}

function parseCursor(value: string | null): PrivateAssetListQuery["cursor"] | undefined | null {
  if (value === null) return undefined;
  if (!/^[A-Za-z0-9_-]{8,700}$/u.test(value)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== "string" || typeof decoded[1] !== "string") return null;
    return { createdAt: decoded[0], id: decoded[1] };
  } catch { return null; }
}

export function parsePrivateAssetAdminListQuery(url: string): PrivateAssetListQuery | null {
  const params = new URL(url).searchParams;
  const allowed = ["purpose", "status", "resourceType", "resourceId", "createdByUserAccountId", "cursor", "pageSize"];
  if ([...params.keys()].some((key) => !allowed.includes(key)) || allowed.some((key) => params.getAll(key).length > 1)) return null;
  const purpose = params.get("purpose");
  const status = params.get("status");
  const resourceType = params.get("resourceType");
  const pageSizeText = params.get("pageSize") ?? "24";
  const cursor = parseCursor(params.get("cursor"));
  if (
    (purpose !== null && !PRIVATE_ASSET_PURPOSES.includes(purpose as PrivateAssetPurpose)) ||
    (status !== null && !STATUSES.includes(status as PrivateAssetStatus)) ||
    (resourceType !== null && !RESOURCE_TYPES.includes(resourceType as PrivateAssetResourceType)) ||
    !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(pageSizeText) ||
    cursor === null
  ) return null;
  try {
    return validatePrivateAssetListQuery({
      ...(purpose ? { purpose: purpose as PrivateAssetPurpose } : {}),
      ...(status ? { status: status as PrivateAssetStatus } : {}),
      ...(resourceType ? { resourceType: resourceType as PrivateAssetResourceType } : {}),
      ...(params.get("resourceId") ? { resourceId: params.get("resourceId")! } : {}),
      ...(params.get("createdByUserAccountId") ? { createdByUserAccountId: params.get("createdByUserAccountId")! } : {}),
      ...(cursor ? { cursor } : {}),
      pageSize: Number(pageSizeText),
    });
  } catch { return null; }
}

export function adminPrivateAssetActor(session: AuthSession): PrivateAssetHumanActor {
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") throw new Error("ADMIN_REQUIRED");
  return {
    userAccountId: session.userId,
    sessionId: session.sessionId,
    authVersion: session.authVersion,
    purpose: "ADMIN",
    role: session.role,
    approvalStatus: "APPROVED",
  };
}

export function prepareMediaAssetUpload(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false as const, response: problemResponse(problems.invalid, { traceId }) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false as const, response: problemResponse(problems.origin, { traceId }) };
  }
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problems.precondition, { traceId }) };
  const sizeText = request.headers.get("x-upload-byte-size") ?? request.headers.get("content-length") ?? "";
  const byteSize = /^(?:0|[1-9][0-9]{0,7})$/u.test(sizeText) ? Number(sizeText) : -1;
  const contentType = request.headers.get("content-type") ?? "";
  const sha256Hex = request.headers.get("x-content-sha256") ?? "";
  const originalFileName = decodedFileName(request.headers.get("x-upload-file-name"));
  if (
    byteSize < 12 ||
    byteSize > PRIVATE_ASSET_MAX_BYTES ||
    !PRIVATE_ASSET_CONTENT_TYPES.includes(contentType as never) ||
    !/^[a-f0-9]{64}$/u.test(sha256Hex) ||
    originalFileName === undefined
  ) return { ok: false as const, response: problemResponse(problems.invalid, { traceId }) };
  return { ok: true as const, value: { traceId, expectedRevision: revision.revision, byteSize, contentType, sha256Hex, originalFileName } };
}

export function preparePrivateAssetDelete(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0 || !hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false as const, response: problemResponse(problems.origin, { traceId }) };
  }
  return { ok: true as const, traceId };
}

export function privateAssetJsonResponse(body: unknown, traceId?: string, status = 200) {
  return noStoreJsonResponse(body, { traceId, status });
}

export function privateAssetBytesResponse(asset: Readonly<{ bytes: Uint8Array; contentType: string }>, traceId?: string) {
  return new Response(Buffer.from(asset.bytes), {
    status: 200,
    headers: noStoreSecurityHeaders({
      contentType: asset.contentType,
      traceId,
      headers: {
        "Content-Disposition": "inline; filename=private-asset",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      },
    }),
  });
}

export function privateAssetErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof PrivateAssetError) {
    const problem = error.code === "ASSET_NOT_AVAILABLE" ? problems.notFound
      : error.code === "DUPLICATE_ASSET" ? problems.conflict
      : error.code === "STORAGE_UNAVAILABLE" ? problems.storage
      : problems.invalid;
    return problemResponse(problem, { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}

export function privateAssetUnavailableResponse(traceId?: string) {
  return problemResponse(problems.unavailable, { traceId });
}

export function privateAssetPreconditionResponse(traceId?: string) {
  return problemResponse(problems.precondition, { traceId });
}
