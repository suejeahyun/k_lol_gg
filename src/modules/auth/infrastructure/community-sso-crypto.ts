import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { parseSessionSigningKeyring } from "./versioned-secret-keyring";
import { COMMUNITY_SSO_FLOW_SECONDS, SSO_TOKEN_PATTERN, type CommunitySsoPurpose } from "../domain/community-sso";

export const newCommunitySsoToken = () => randomBytes(32).toString("base64url");
export const communitySsoClientHash = (secret: string) => createHash("sha256").update("gg-hub:sso-client:v1\0").update(secret).digest();
export const communitySsoCodeHash = (code: string) => createHash("sha256").update("gg-hub:sso-code:v1\0").update(code).digest();
export const communitySsoChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export function communitySsoSecretMatches(secret: string, hash: Uint8Array): boolean {
  return SSO_TOKEN_PATTERN.test(secret) && hash.byteLength === 32 && timingSafeEqual(communitySsoClientHash(secret), hash);
}

export type CommunitySsoFlow = Readonly<{ siteId: string; state: string; verifier: string; purpose: CommunitySsoPurpose; nextPath: string }>;
export async function encodeCommunitySsoFlow(flow: CommunitySsoFlow): Promise<string> {
  const keys = parseSessionSigningKeyring(process.env.SESSION_SIGNING_KEYS);
  return new SignJWT({ ...flow }).setProtectedHeader({ alg: "HS256", typ: "JWT", kid: keys.currentKeyId })
    .setIssuer(`gg-community:${flow.siteId}:sso-flow`).setAudience("community-sso-callback")
    .setIssuedAt().setExpirationTime(`${COMMUNITY_SSO_FLOW_SECONDS}s`).sign(keys.keys.get(keys.currentKeyId)!);
}
export async function decodeCommunitySsoFlow(token: string | undefined, siteId: string): Promise<CommunitySsoFlow | null> {
  if (!token || token.length > 6000) return null;
  try {
    const keys = parseSessionSigningKeyring(process.env.SESSION_SIGNING_KEYS);
    const { payload } = await jwtVerify(token, (header) => {
      if (header.typ !== "JWT" || typeof header.kid !== "string" || !keys.keys.has(header.kid)) throw new Error("INVALID_SSO_FLOW");
      return keys.keys.get(header.kid)!;
    }, { algorithms: ["HS256"], issuer: `gg-community:${siteId}:sso-flow`, audience: "community-sso-callback", maxTokenAge: COMMUNITY_SSO_FLOW_SECONDS });
    if (payload.siteId !== siteId || typeof payload.state !== "string" || !SSO_TOKEN_PATTERN.test(payload.state)
      || typeof payload.verifier !== "string" || !SSO_TOKEN_PATTERN.test(payload.verifier)
      || (payload.purpose !== "ACCOUNT" && payload.purpose !== "ADMIN") || typeof payload.nextPath !== "string" || payload.nextPath.length > 2048) return null;
    return { siteId, state: payload.state, verifier: payload.verifier, purpose: payload.purpose, nextPath: payload.nextPath };
  } catch { return null; }
}
