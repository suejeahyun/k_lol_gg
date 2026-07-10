import { NextRequest } from "next/server";
import { getRequiredSecretInProduction, matchesRequestSecret } from "@/lib/security/secrets";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";

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
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");
  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (
    matchesRequestSecret(secret, {
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

export function getBodyText(body: Record<string, unknown>) {
  const userRequest = body.userRequest as { utterance?: unknown } | undefined;
  return String(body.message || body.text || body.utterance || userRequest?.utterance || "");
}

export function getBodyRoom(body: Record<string, unknown>) {
  if (typeof body.roomName === "string") return body.roomName;
  if (typeof body.room === "string") return body.room;
  return null;
}

export function getBodySender(body: Record<string, unknown>) {
  return typeof body.sender === "string" ? body.sender : null;
}
