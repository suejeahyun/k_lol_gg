import { SERVICE_BRAND } from "@/lib/service-brand";
import { parseCommunityProfileInput } from "@/modules/accounts/domain/account-contracts";
import { authorizeAccountApi, guardAccountMutationOrigin } from "@/modules/accounts/infrastructure/account-http";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { communitySsoRepository } from "@/modules/auth/infrastructure/runtime-community-sso";
import { requireSiteFeature } from "@/modules/operations/infrastructure/site-feature-access";
import { noStoreJsonResponse, readJsonBody } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (SERVICE_BRAND.id !== "community") return new Response(null, { status: 404 });
  const originFailure = guardAccountMutationOrigin(request); if (originFailure) return originFailure;
  if (new URL(request.url).search) return noStoreJsonResponse({ message: "요청 주소를 확인해 주세요." }, { status: 400 });
  const authorization = await authorizeAccountApi(request); if (!authorization.ok) return authorization.response;
  const featureFailure = await requireSiteFeature(request, "registrations"); if (featureFailure) return featureFailure;
  const body = await readJsonBody(request, { maximumBytes: 2048 });
  const input = body.ok ? parseCommunityProfileInput(body.value) : null;
  if (!input?.ok) return noStoreJsonResponse({ message: "회원명과 Riot ID를 확인해 주세요." }, { status: 400 });
  try {
    const result = await communitySsoRepository().completeLocalProfile(input.value, transactionSessionActor(authorization.session));
    return noStoreJsonResponse({ ...result, message: result.state === "CLAIM_PENDING" ? "기존 플레이어와의 연결을 운영진이 확인합니다." : authorization.session.accountStatus === "PENDING" ? "게임 프로필이 등록되었습니다. 운영진의 가입 승인을 기다려 주세요." : "게임 프로필이 등록되었습니다." });
  } catch { return noStoreJsonResponse({ message: "프로필을 등록할 수 없습니다. 이미 연결된 Riot ID인지 확인하거나 운영팀에 문의해 주세요." }, { status: 409 }); }
}
