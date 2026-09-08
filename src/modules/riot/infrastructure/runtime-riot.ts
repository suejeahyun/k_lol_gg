import "server-only";

import { isFixtureAuthRuntimeEnabled } from "@/modules/auth/infrastructure/fixture-auth-repository";
import { getDatabase } from "@/platform/db/client";

import { RiotApplicationService } from "../application/riot-application";
import type { RiotQueryRepository } from "../application/riot-query";
import { FakeRiotGateway, FakeRiotIdentityProtector, FakeRsoAdapter } from "./fake-riot-adapters";
import { InMemoryRiotAdapter } from "./in-memory-riot-adapter";
import { PostgresRiotAdapter } from "./postgres-riot-adapter";
import { PostgresPublicRiotQueryRepository } from "./postgres-public-riot-query";
import { RiotApiGateway } from "./riot-api-gateway";
import { RiotAesGcmIdentityProtector, parseRiotEncryptionKeyring } from "./riot-identity-protector";
import { PostgresRiotJobVerifier } from "./riot-job-verifier";
import { RiotRsoAdapter } from "./riot-rso-adapter";
import { isRiotFeatureEnabled, readRiotProductionConfiguration } from "./riot-runtime-policy";

export type RuntimeRiot = Readonly<{
  service: RiotApplicationService;
  query: RiotQueryRepository;
}>;

declare global {
  var __klolV2FakeRiotRuntime: RuntimeRiot | undefined;
}

function fakeRuntimeEnabled() {
  return isRiotFeatureEnabled({ V2_RIOT_INTEGRATION_ENABLED: process.env.V2_RIOT_INTEGRATION_ENABLED }) && process.env.V2_RIOT_FAKE_RUNTIME === "true" && isFixtureAuthRuntimeEnabled();
}

export function getRuntimeRiot(): RuntimeRiot | null {
  if (globalThis.__klolV2FakeRiotRuntime) return globalThis.__klolV2FakeRiotRuntime;
  if (fakeRuntimeEnabled()) {
    const adapter = new InMemoryRiotAdapter(true);
    globalThis.__klolV2FakeRiotRuntime = {
      query: adapter,
      service: new RiotApplicationService({
        ...adapter.dependencies,
        gateway: new FakeRiotGateway(true),
        rso: new FakeRsoAdapter("klol-v2-runtime-rso", true),
        identityProtector: new FakeRiotIdentityProtector(),
      }),
    };
    return globalThis.__klolV2FakeRiotRuntime;
  }

  const configuration = readRiotProductionConfiguration(process.env);
  if (!configuration) return null;
  try {
    const database = getDatabase();
    const identityProtector = new RiotAesGcmIdentityProtector(
      parseRiotEncryptionKeyring(configuration.encryptionKeys),
    );
    const adapter = new PostgresRiotAdapter(database, {
      featureEnabled: true,
      requireDatabaseFeatureFlag: true,
      jobVerifier: new PostgresRiotJobVerifier(configuration.jobSecret),
    });
    globalThis.__klolV2FakeRiotRuntime = {
      query: adapter,
      service: new RiotApplicationService({
        ...adapter.dependencies,
        gateway: new RiotApiGateway({
          apiKey: configuration.apiKey,
          regionalBaseUrl: configuration.regionalBaseUrl,
          platformBaseUrl: configuration.platformBaseUrl,
          timeoutMilliseconds: configuration.requestTimeoutMilliseconds,
        }),
        rso: new RiotRsoAdapter(database, identityProtector, {
          authorizeUrl: configuration.rsoAuthorizeUrl,
          tokenUrl: configuration.rsoTokenUrl,
          accountUrl: configuration.rsoAccountUrl,
          clientId: configuration.rsoClientId,
          clientSecret: configuration.rsoClientSecret,
          redirectUri: configuration.rsoRedirectUri,
          stateSecret: configuration.rsoStateSecret,
          timeoutMilliseconds: configuration.requestTimeoutMilliseconds,
        }),
        identityProtector,
      }),
    };
    return globalThis.__klolV2FakeRiotRuntime;
  } catch {
    return null;
  }
}

export async function loadRuntimeRiot<T>(loader: (runtime: RuntimeRiot) => Promise<T>) {
  const runtime = getRuntimeRiot();
  if (!runtime) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(runtime) }; }
  catch {
    return { state: "error" as const };
  }
}

export async function loadRuntimePublicRiotProfile(playerId: string) {
  if (process.env.V2_PUBLIC_DATA_SOURCE !== "postgres" || !process.env.DATABASE_URL) {
    return { state: "unavailable" as const };
  }
  try {
    const repository = new PostgresPublicRiotQueryRepository(getDatabase());
    return { state: "ready" as const, data: await repository.getPublicProfileState(playerId) };
  } catch {
    return { state: "error" as const };
  }
}
