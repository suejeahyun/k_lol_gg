export function isRiotFeatureEnabled(environment: Readonly<{ V2_RIOT_INTEGRATION_ENABLED?: string }>) {
  return environment.V2_RIOT_INTEGRATION_ENABLED === "true";
}

export type RiotProductionConfiguration = Readonly<{
  apiKey: string;
  regionalBaseUrl: string;
  platformBaseUrl: string;
  requestTimeoutMilliseconds: number;
  rsoAuthorizeUrl: string;
  rsoTokenUrl: string;
  rsoAccountUrl: string;
  rsoClientId: string;
  rsoClientSecret: string;
  rsoRedirectUri: string;
  rsoStateSecret: string;
  encryptionKeys: string;
  jobSecret: string;
}>;

type RiotRuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const regionalRoutes = new Set(["americas", "asia", "europe", "sea"]);
const platformRoutes = new Set([
  "br1", "eun1", "euw1", "jp1", "kr", "la1", "la2", "me1", "na1", "oc1", "ru", "sg2", "tr1", "tw2", "vn2",
]);

function confidential(value: string | undefined, minimumLength: number, maximumLength: number): value is string {
  return Boolean(value && value.length >= minimumLength && value.length <= maximumLength && !/[\s\u0000-\u001f\u007f]/u.test(value));
}

function canonicalOrigin(value: string | undefined, nodeEnvironment: string | undefined): URL | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname);
    if (
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== "/" ||
      (parsed.protocol !== "https:" && !(nodeEnvironment !== "production" && loopback && parsed.protocol === "http:"))
    ) return null;
    return parsed;
  } catch { return null; }
}

export function readRiotProductionConfiguration(
  environment: RiotRuntimeEnvironment,
): RiotProductionConfiguration | null {
  if (
    !isRiotFeatureEnabled(environment) ||
    environment.V2_RIOT_FAKE_RUNTIME === "true" ||
    environment.V2_PUBLIC_DATA_SOURCE !== "postgres" ||
    !environment.DATABASE_URL
  ) return null;
  const regional = environment.RIOT_API_REGIONAL_ROUTE?.toLocaleLowerCase("en-US");
  const platform = environment.RIOT_API_PLATFORM_ROUTE?.toLocaleLowerCase("en-US");
  const publicOrigin = canonicalOrigin(environment.V2_PUBLIC_ORIGIN, environment.NODE_ENV);
  const redirectUri = environment.RIOT_RSO_REDIRECT_URI;
  const timeout = environment.RIOT_REQUEST_TIMEOUT_MS === undefined
    ? 5_000
    : Number(environment.RIOT_REQUEST_TIMEOUT_MS);
  if (
    !regional || !regionalRoutes.has(regional) ||
    !platform || !platformRoutes.has(platform) ||
    !publicOrigin ||
    redirectUri !== new URL("/api/me/riot/rso/callback", publicOrigin).toString() ||
    !Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 15_000 ||
    !confidential(environment.RIOT_API_KEY, 16, 512) ||
    !confidential(environment.RIOT_RSO_CLIENT_ID, 3, 200) ||
    !confidential(environment.RIOT_RSO_CLIENT_SECRET, 32, 1_000) ||
    !confidential(environment.RIOT_RSO_STATE_SECRET, 32, 256) ||
    !environment.RIOT_ENCRYPTION_KEYS || environment.RIOT_ENCRYPTION_KEYS.length > 4_096 ||
    !confidential(environment.OPERATIONS_JOB_SECRET, 32, 1_000)
  ) return null;
  return {
    apiKey: environment.RIOT_API_KEY,
    regionalBaseUrl: `https://${regional}.api.riotgames.com/`,
    platformBaseUrl: `https://${platform}.api.riotgames.com/`,
    requestTimeoutMilliseconds: timeout,
    rsoAuthorizeUrl: "https://auth.riotgames.com/authorize",
    rsoTokenUrl: "https://auth.riotgames.com/token",
    rsoAccountUrl: `https://${regional}.api.riotgames.com/riot/account/v1/accounts/me`,
    rsoClientId: environment.RIOT_RSO_CLIENT_ID,
    rsoClientSecret: environment.RIOT_RSO_CLIENT_SECRET,
    rsoRedirectUri: redirectUri,
    rsoStateSecret: environment.RIOT_RSO_STATE_SECRET,
    encryptionKeys: environment.RIOT_ENCRYPTION_KEYS,
    jobSecret: environment.OPERATIONS_JOB_SECRET,
  };
}
