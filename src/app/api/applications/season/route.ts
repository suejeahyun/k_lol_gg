import { readValidatedTraceId } from "@/platform/http";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import { guardSeasonApplicationMutation } from "@/modules/seasons/infrastructure/season-application-rate-limit";
import {
  prepareSeasonMutation,
  requireSeasonApiSession,
  seasonMutationResponse,
  seasonRateLimitedResponse,
  seasonRateLimitUnavailableResponse,
  seasonReadResponse,
  seasonServiceErrorResponse,
  seasonUnavailableResponse,
} from "@/modules/seasons/infrastructure/season-http";
import { SeasonServiceError } from "@/modules/seasons/domain/season";

export const dynamic = "force-dynamic";

function recruitNoFromUrl(url: string) {
  const search = new URL(url).searchParams;
  if ([...search.keys()].some((key) => key !== "recruitNo") || search.getAll("recruitNo").length > 1) {
    throw new SeasonServiceError("INVALID_INPUT", "허용되지 않거나 중복된 모집 회차입니다.");
  }
  const raw = search.get("recruitNo") ?? "1";
  if (!/^[1-9][0-9]*$/.test(raw)) throw new SeasonServiceError("INVALID_INPUT", "모집 회차를 확인해 주세요.");
  const recruitNo = Number(raw);
  if (!Number.isSafeInteger(recruitNo) || recruitNo > 999) throw new SeasonServiceError("INVALID_INPUT", "모집 회차를 확인해 주세요.");
  return recruitNo;
}

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(traceId);
  try {
    const session = await getCurrentSession("ACCOUNT");
    return seasonReadResponse(await service.getApplicationHub(session?.userId ?? null, recruitNoFromUrl(request.url)), 200, traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}

export async function POST(request: Request) {
  const authorization = await requireSeasonApiSession("USER");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareSeasonMutation(
    request,
    "applications:season:upsert",
    authorization.session,
  );
  if (!prepared.ok) return prepared.response;
  const rateLimit = await guardSeasonApplicationMutation(request, authorization.session, "UPSERT");
  if (!rateLimit.available) return seasonRateLimitUnavailableResponse(prepared.value.traceId);
  if (!rateLimit.allowed) return seasonRateLimitedResponse(rateLimit.retryAfterSeconds, prepared.value.traceId);
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(prepared.value.traceId);
  try {
    const result = await service.upsertOwnApplication(
      prepared.value.context,
      prepared.value.expectedRevision,
      prepared.value.body,
    );
    return seasonMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, prepared.value.traceId);
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireSeasonApiSession("USER");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareSeasonMutation(
    request,
    "applications:season:cancel",
    authorization.session,
  );
  if (!prepared.ok) return prepared.response;
  const rateLimit = await guardSeasonApplicationMutation(request, authorization.session, "CANCEL");
  if (!rateLimit.available) return seasonRateLimitUnavailableResponse(prepared.value.traceId);
  if (!rateLimit.allowed) return seasonRateLimitedResponse(rateLimit.retryAfterSeconds, prepared.value.traceId);
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(prepared.value.traceId);
  try {
    const result = await service.cancelOwnApplication(
      prepared.value.context,
      prepared.value.expectedRevision,
      prepared.value.body,
    );
    return seasonMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, prepared.value.traceId);
  }
}
