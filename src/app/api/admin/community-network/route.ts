import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { parseCommunityNetworkInput } from "@/modules/community-network/domain/community-network";
import {
  communityNetworkErrorResponse, communityNetworkInvalidResponse, communityNetworkMutationResponse,
  communityNetworkUnavailableResponse, prepareCommunityNetworkMutation, requireCommunityNetworkApiSession,
} from "@/modules/community-network/infrastructure/community-network-http";
import { getRuntimeCommunityNetworkRepository, isCommunityNetworkEnabled } from "@/modules/community-network/infrastructure/runtime";
import { formatRevisionEtag, noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (!isCommunityNetworkEnabled()) return communityNetworkUnavailableResponse(traceId);
  const authorization = await requireCommunityNetworkApiSession();
  if (!authorization.ok) return authorization.response;
  if (new URL(request.url).searchParams.size > 0) return communityNetworkInvalidResponse(traceId);
  const repository = getRuntimeCommunityNetworkRepository();
  if (!repository) return communityNetworkUnavailableResponse(traceId);
  try {
    const snapshot = await repository.getSnapshot();
    return noStoreJsonResponse({ snapshot }, { traceId, headers: { ETag: formatRevisionEtag(snapshot.revision) } });
  } catch (error) { return communityNetworkErrorResponse(error, traceId); }
}

export async function PUT(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (!isCommunityNetworkEnabled()) return communityNetworkUnavailableResponse(traceId);
  const authorization = await requireCommunityNetworkApiSession();
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareCommunityNetworkMutation(request);
  if (!prepared.ok) return prepared.response;
  try {
    const snapshot = parseCommunityNetworkInput(prepared.body);
    const repository = getRuntimeCommunityNetworkRepository();
    if (!repository) return communityNetworkUnavailableResponse(prepared.traceId);
    const result = await repository.updateSnapshot({ actor: transactionSessionActor(authorization.session), metadata: prepared.metadata, snapshot });
    return communityNetworkMutationResponse(result, prepared.traceId);
  } catch (error) { return communityNetworkErrorResponse(error, prepared.traceId); }
}
