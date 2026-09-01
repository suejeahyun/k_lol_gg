import { randomUUID } from "node:crypto";
import { decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import {
  isAuthRole,
  type AuthSession,
  type AuthSessionSeed,
} from "../domain/auth-session";
import type { SessionSigningKeyring } from "./versioned-secret-keyring";

const ISSUER = "k-lol-gg-v2";
const AUDIENCE = "k-lol-gg-v2-web";
const ALGORITHM = "HS256";
const DEFAULT_TTL_SECONDS = 30 * 60;
const MAXIMUM_TTL_SECONDS = 30 * 60;
const CLOCK_TOLERANCE_SECONDS = 5;
export const MAXIMUM_SESSION_TOKEN_BYTES = 8 * 1024;

type EncodeOptions = {
  nowMs?: number;
  ttlSeconds?: number;
  sessionId?: string;
};

type DecodeOptions = {
  nowMs?: number;
};

export class JoseSessionCodec {
  private readonly keyring: SessionSigningKeyring;

  constructor(secretOrKeyring: string | SessionSigningKeyring) {
    if (typeof secretOrKeyring === "string") {
      const key = new TextEncoder().encode(secretOrKeyring);
      if (key.byteLength < 32) {
        throw new Error("Session secret must be at least 32 bytes.");
      }
      this.keyring = { currentKeyId: "local", keys: new Map([["local", key]]) };
      return;
    }

    const current = secretOrKeyring.keys.get(secretOrKeyring.currentKeyId);
    if (!current || current.byteLength < 32) {
      throw new Error("Current session signing key is unavailable.");
    }
    this.keyring = secretOrKeyring;
  }

  async encode(seed: AuthSessionSeed, options: EncodeOptions = {}): Promise<string> {
    const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
    const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const sessionId = options.sessionId ?? randomUUID();
    const key = this.keyring.keys.get(this.keyring.currentKeyId);

    if (
      !key ||
      !Number.isSafeInteger(ttlSeconds) ||
      ttlSeconds < 1 ||
      ttlSeconds > MAXIMUM_TTL_SECONDS ||
      !Number.isSafeInteger(seed.authVersion) ||
      seed.authVersion < 0
    ) {
      throw new Error("Session issuance input is invalid.");
    }

    return new SignJWT({
      role: seed.role,
      authVersion: seed.authVersion,
      adminTotpVerified: seed.adminTotpVerified,
      source: seed.source,
    })
      .setProtectedHeader({ alg: ALGORITHM, typ: "JWT", kid: this.keyring.currentKeyId })
      .setSubject(seed.userId)
      .setJti(sessionId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ttlSeconds)
      .sign(key);
  }

  async decode(token: string | undefined, options: DecodeOptions = {}): Promise<AuthSession | null> {
    if (!token || new TextEncoder().encode(token).byteLength > MAXIMUM_SESSION_TOKEN_BYTES) {
      return null;
    }

    try {
      const unverifiedHeader = decodeProtectedHeader(token);
      if (
        unverifiedHeader.alg !== ALGORITHM ||
        unverifiedHeader.typ !== "JWT" ||
        typeof unverifiedHeader.kid !== "string"
      ) {
        return null;
      }
      const key = this.keyring.keys.get(unverifiedHeader.kid);
      if (!key) return null;

      const { payload, protectedHeader } = await jwtVerify(token, key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: new Date(options.nowMs ?? Date.now()),
      });

      const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);

      if (
        protectedHeader.kid !== unverifiedHeader.kid ||
        !payload.sub ||
        typeof payload.jti !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.jti) ||
        !isAuthRole(payload.role) ||
        !Number.isSafeInteger(payload.authVersion) ||
        (payload.authVersion as number) < 0 ||
        typeof payload.adminTotpVerified !== "boolean" ||
        (payload.source !== "fixture" && payload.source !== "database") ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        !Number.isSafeInteger(payload.iat) ||
        !Number.isSafeInteger(payload.exp) ||
        payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > MAXIMUM_TTL_SECONDS
      ) {
        return null;
      }

      return {
        sessionId: payload.jti,
        userId: payload.sub,
        role: payload.role,
        authVersion: payload.authVersion as number,
        adminTotpVerified: payload.adminTotpVerified,
        source: payload.source,
        issuedAt: payload.iat * 1000,
        expiresAt: payload.exp * 1000,
      };
    } catch {
      return null;
    }
  }
}
