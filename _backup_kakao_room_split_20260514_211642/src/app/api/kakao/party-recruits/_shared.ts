import { NextRequest, NextResponse } from "next/server";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";

export const PARTY_RECRUIT_FORMAT_VERSION = "party-recruit-v1";

export async function readJsonBody(req: NextRequest) {
  return req.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

export function rejectIfInvalidPartySecret(req: NextRequest, bodySecret: unknown) {
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");
  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (headerSecret === secret || bearer === secret || secretText === secret) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
      reply: "[K-LOL.GG 구인구직 실패]\n인증값이 올바르지 않습니다.",
    },
    { status: 401 },
  );
}

export function getBodyText(body: Record<string, unknown>) {
  return String(body.message || body.text || body.utterance || "");
}

export function getBodyRoom(body: Record<string, unknown>) {
  if (typeof body.roomName === "string") return body.roomName;
  if (typeof body.room === "string") return body.room;
  return null;
}

export function getBodySender(body: Record<string, unknown>) {
  return typeof body.sender === "string" ? body.sender : null;
}
