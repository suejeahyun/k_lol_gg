import { NextRequest } from "next/server";
import { getRequiredSecretCandidatesInProduction, matchesRequestSecret } from "@/lib/security/secrets";

export function isAuthorizedKakaoRequest(req: NextRequest, bodySecret: unknown) {
  const secrets = getRequiredSecretCandidatesInProduction("KAKAO_RECRUIT_SECRET");
  if (secrets.length === 0) return true;
  return matchesRequestSecret(secrets, {
    headers: [req.headers.get("x-kakao-recruit-secret"), req.headers.get("x-kakao-secret")],
    bearer: req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
    body: typeof bodySecret === "string" ? bodySecret : null,
    query: req.nextUrl.searchParams.get("secret"),
  });
}

export function normalizeSessionKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("ko-KR").slice(0, 180);
}
