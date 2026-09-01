import "server-only";

import type { AuthRepository } from "../application/ports/auth-repository";
import { getDatabase } from "@/platform/db/client";
import { isFixtureAuthRuntimeEnabled } from "./fixture-auth-repository";
import { JoseSessionCodec } from "./jose-session-codec";
import { PostgresAuthRepository } from "./postgres-auth-repository";
import {
  parseDatabaseAuthRuntimeSecrets,
  type TotpEncryptionKeyring,
} from "./versioned-secret-keyring";

export type FixtureRuntimeAuthContext = Readonly<{
  mode: "fixture";
  codec: JoseSessionCodec;
}>;

export type DatabaseRuntimeAuthContext = Readonly<{
  mode: "database";
  codec: JoseSessionCodec;
  repository: AuthRepository;
  rateLimitPepper: Buffer;
  totpKeys: TotpEncryptionKeyring;
}>;

export type RuntimeAuthContext = FixtureRuntimeAuthContext | DatabaseRuntimeAuthContext;

function fixtureContext(): FixtureRuntimeAuthContext | null {
  const secret = process.env.V2_TEST_AUTH_SECRET;
  if (!secret) return null;

  try {
    return { mode: "fixture", codec: new JoseSessionCodec(secret) };
  } catch {
    return null;
  }
}

function databaseContext(): DatabaseRuntimeAuthContext | null {
  try {
    const secrets = parseDatabaseAuthRuntimeSecrets({
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SIGNING_KEYS: process.env.SESSION_SIGNING_KEYS,
      TOTP_ENCRYPTION_KEYS: process.env.TOTP_ENCRYPTION_KEYS,
      V2_AUTH_RATE_LIMIT_PEPPER: process.env.V2_AUTH_RATE_LIMIT_PEPPER,
    });
    const repository = new PostgresAuthRepository(getDatabase());
    return {
      mode: "database",
      codec: new JoseSessionCodec(secrets.sessionSigningKeys),
      repository,
      rateLimitPepper: secrets.rateLimitPepper,
      totpKeys: secrets.totpEncryptionKeys,
    };
  } catch {
    return null;
  }
}

export function resolveRuntimeAuthContext(): RuntimeAuthContext | null {
  if (isFixtureAuthRuntimeEnabled()) return fixtureContext();
  return databaseContext();
}
