import { NextRequest } from "next/server";
import { getRequiredSecretCandidatesInProduction, matchesRequestSecret } from "@/lib/security/secrets";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { normalizeKakaoIdentity } from "@/lib/kakao/input-guard";
import { evaluateKakaoRequestPolicy, type KakaoPolicyFeature } from "@/lib/kakao/policy";
import { getKakaoOperationSettings } from "@/lib/kakao/settings";

export const PARTY_RECRUIT_FORMAT_VERSION = "party-recruit-v2";

export async function readJsonBody(req: NextRequest) {
  return req.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

export function partyRecruitJson(
  body: Record<string, unknown> & { reply: string },
  statusCode = 200,
) {
  return kakaoJsonReply(
    {
      formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
      ...body,
    },
    statusCode,
  );
}

export function rejectIfInvalidPartySecret(req: NextRequest, bodySecret: unknown) {
  const secrets = getRequiredSecretCandidatesInProduction("KAKAO_RECRUIT_SECRET");
  if (secrets.length === 0) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (
    matchesRequestSecret(secrets, {
      headers: [headerSecret],
      bearer,
      body: secretText,
      query: querySecret,
    })
  ) {
    return null;
  }

  return partyRecruitJson(
    {
      reply: "[K-LOL.GG 구인구직 실패]\n인증값이 올바르지 않습니다.",
    },
    401,
  );
}

export async function rejectPartyPolicy(
  body: Record<string, unknown>,
  feature: KakaoPolicyFeature,
  options: { requireIdentity?: boolean } = {},
) {
  const settings = await getKakaoOperationSettings();
  const policy = evaluateKakaoRequestPolicy(settings, {
    feature,
    roomName: getBodyRoom(body),
    sender: getBodySender(body),
    requireRoom: options.requireIdentity ?? false,
    requireSender: options.requireIdentity ?? false,
  });
  if (policy.ok) return null;
  return partyRecruitJson(
    {
      reply: policy.message,
      ignored: policy.reason === "BOT_SENDER",
      policyReason: policy.reason,
    },
    policy.status,
  );
}

export function getBodyText(body: Record<string, unknown>) {
  const userRequest = body.userRequest as { utterance?: unknown } | undefined;
  return String(body.message || body.text || body.utterance || userRequest?.utterance || "");
}

export function getBodyRoom(body: Record<string, unknown>) {
  return normalizeKakaoIdentity(body.roomName) ?? normalizeKakaoIdentity(body.room);
}

export function getBodySender(body: Record<string, unknown>) {
  return normalizeKakaoIdentity(body.sender);
}
