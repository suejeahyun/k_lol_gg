import { jwtVerify, SignJWT } from "jose";
import {
  isAuthRole,
  type AuthSession,
  type AuthSessionSeed,
} from "../domain/auth-session";

const ISSUER = "k-lol-gg-v2";
const AUDIENCE = "k-lol-gg-v2-web";
const ALGORITHM = "HS256";
const DEFAULT_TTL_SECONDS = 30 * 60;
const MAXIMUM_TTL_SECONDS = 30 * 60;
const CLOCK_TOLERANCE_SECONDS = 5;

type EncodeOptions = {
  nowMs?: number;
  ttlSeconds?: number;
};

type DecodeOptions = {
  nowMs?: number;
};

export class JoseSessionCodec {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    const key = new TextEncoder().encode(secret);
    if (key.byteLength < 32) {
      throw new Error("Session secret must be at least 32 bytes.");
    }
    this.key = key;
  }

  async encode(seed: AuthSessionSeed, options: EncodeOptions = {}): Promise<string> {
    const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
    const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    return new SignJWT({
      role: seed.role,
      authVersion: seed.authVersion,
      adminTotpVerified: seed.adminTotpVerified,
      source: seed.source,
    })
      .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
      .setSubject(seed.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ttlSeconds)
      .sign(this.key);
  }

  async decode(token: string | undefined, options: DecodeOptions = {}): Promise<AuthSession | null> {
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: new Date(options.nowMs ?? Date.now()),
      });

      const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);

      if (
        !payload.sub ||
        !isAuthRole(payload.role) ||
        !Number.isInteger(payload.authVersion) ||
        typeof payload.adminTotpVerified !== "boolean" ||
        (payload.source !== "fixture" && payload.source !== "database") ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        !Number.isInteger(payload.iat) ||
        !Number.isInteger(payload.exp) ||
        payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > MAXIMUM_TTL_SECONDS
      ) {
        return null;
      }

      return {
        userId: payload.sub,
        role: payload.role,
        authVersion: payload.authVersion as number,
        adminTotpVerified: payload.adminTotpVerified,
        source: payload.source,
        expiresAt: payload.exp * 1000,
      };
    } catch {
      return null;
    }
  }
}
