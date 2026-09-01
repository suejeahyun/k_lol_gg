export type SessionSigningKeyring = Readonly<{
  currentKeyId: string;
  keys: ReadonlyMap<string, Uint8Array>;
}>;

export type TotpEncryptionKeyring = Readonly<{
  currentKeyVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}>;

export type DatabaseAuthRuntimeSecrets = Readonly<{
  sessionSigningKeys: SessionSigningKeyring;
  totpEncryptionKeys: TotpEncryptionKeyring;
  rateLimitPepper: Buffer;
}>;

type RawKeyring = {
  current?: unknown;
  keys?: unknown;
};

function decodeKey(encoded: unknown, environmentName: string): Buffer {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error(`${environmentName} contains an invalid key.`);
  }

  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength !== 32 || key.toString("base64url") !== encoded) {
    throw new Error(`${environmentName} keys must be canonical base64url-encoded 32-byte values.`);
  }
  return key;
}

function parseObject(source: string | undefined, environmentName: string): RawKeyring {
  if (!source || source.length > 16_384) {
    throw new Error(`${environmentName} is required and must be at most 16 KiB.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${environmentName} must be valid JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${environmentName} must be a JSON object.`);
  }
  return parsed as RawKeyring;
}

function parseKeys(raw: RawKeyring, environmentName: string): Record<string, unknown> {
  if (!raw.keys || typeof raw.keys !== "object" || Array.isArray(raw.keys)) {
    throw new Error(`${environmentName}.keys must be a JSON object.`);
  }

  const entries = Object.entries(raw.keys);
  if (entries.length === 0 || entries.length > 8) {
    throw new Error(`${environmentName} must contain 1 to 8 keys.`);
  }
  return raw.keys as Record<string, unknown>;
}

export function parseSessionSigningKeyring(source: string | undefined): SessionSigningKeyring {
  const environmentName = "SESSION_SIGNING_KEYS";
  const raw = parseObject(source, environmentName);
  const currentKeyId = String(raw.current ?? "");
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(currentKeyId)) {
    throw new Error(`${environmentName}.current is invalid.`);
  }

  const entries = Object.entries(parseKeys(raw, environmentName));
  const keys = new Map(entries.map(([keyId, encoded]) => {
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(keyId)) {
      throw new Error(`${environmentName} contains an invalid key id.`);
    }
    return [keyId, decodeKey(encoded, environmentName)] as const;
  }));
  if (!keys.has(currentKeyId)) {
    throw new Error(`${environmentName}.current must reference an available key.`);
  }
  return { currentKeyId, keys };
}

export function parseTotpEncryptionKeyring(source: string | undefined): TotpEncryptionKeyring {
  const environmentName = "TOTP_ENCRYPTION_KEYS";
  const raw = parseObject(source, environmentName);
  const currentKeyVersion = Number(raw.current);
  if (!Number.isSafeInteger(currentKeyVersion) || currentKeyVersion < 1) {
    throw new Error(`${environmentName}.current must be a positive integer.`);
  }

  const keys = new Map<number, Buffer>();
  for (const [rawVersion, encoded] of Object.entries(parseKeys(raw, environmentName))) {
    if (!/^[1-9]\d{0,8}$/.test(rawVersion)) {
      throw new Error(`${environmentName} contains an invalid key version.`);
    }
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version)) {
      throw new Error(`${environmentName} contains an unsafe key version.`);
    }
    keys.set(version, decodeKey(encoded, environmentName));
  }
  if (!keys.has(currentKeyVersion)) {
    throw new Error(`${environmentName}.current must reference an available key.`);
  }
  return { currentKeyVersion, keys };
}

export function parseRateLimitPepper(source: string | undefined): Buffer {
  return decodeKey(source, "V2_AUTH_RATE_LIMIT_PEPPER");
}

export function parseDatabaseAuthRuntimeSecrets(
  environment: Readonly<{
    DATABASE_URL?: string;
    SESSION_SIGNING_KEYS?: string;
    TOTP_ENCRYPTION_KEYS?: string;
    V2_AUTH_RATE_LIMIT_PEPPER?: string;
  }>,
): DatabaseAuthRuntimeSecrets {
  if (!environment.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database authentication.");
  }

  const databaseUrl = new URL(environment.DATABASE_URL);
  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }

  return {
    sessionSigningKeys: parseSessionSigningKeyring(environment.SESSION_SIGNING_KEYS),
    totpEncryptionKeys: parseTotpEncryptionKeyring(environment.TOTP_ENCRYPTION_KEYS),
    rateLimitPepper: parseRateLimitPepper(environment.V2_AUTH_RATE_LIMIT_PEPPER),
  };
}
