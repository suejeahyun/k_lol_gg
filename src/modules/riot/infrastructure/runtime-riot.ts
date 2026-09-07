import "server-only";

import { isFixtureAuthRuntimeEnabled } from "@/modules/auth/infrastructure/fixture-auth-repository";

import { RiotApplicationService } from "../application/riot-application";
import { FakeRiotGateway, FakeRiotIdentityProtector, FakeRsoAdapter } from "./fake-riot-adapters";
import { InMemoryRiotAdapter } from "./in-memory-riot-adapter";
import { isRiotFeatureEnabled } from "./riot-runtime-policy";

export type RuntimeRiot = Readonly<{
  service: RiotApplicationService;
  query: InMemoryRiotAdapter;
}>;

declare global {
  var __klolV2FakeRiotRuntime: RuntimeRiot | undefined;
}

function fakeRuntimeEnabled() {
  return isRiotFeatureEnabled({ V2_RIOT_INTEGRATION_ENABLED: process.env.V2_RIOT_INTEGRATION_ENABLED }) && process.env.V2_RIOT_FAKE_RUNTIME === "true" && isFixtureAuthRuntimeEnabled();
}

export function getRuntimeRiot(): RuntimeRiot | null {
  // Production stays fail-closed until real Riot/RSO credential adapters are explicitly integrated.
  if (!fakeRuntimeEnabled()) return null;
  if (!globalThis.__klolV2FakeRiotRuntime) {
    const adapter = new InMemoryRiotAdapter(true);
    const gateway = new FakeRiotGateway(true);
    const rso = new FakeRsoAdapter("klol-v2-runtime-rso", true);
    const identityProtector = new FakeRiotIdentityProtector();
    globalThis.__klolV2FakeRiotRuntime = {
      query: adapter,
      service: new RiotApplicationService({
        ...adapter.dependencies,
        gateway,
        rso,
        identityProtector,
      }),
    };
  }
  return globalThis.__klolV2FakeRiotRuntime;
}

export async function loadRuntimeRiot<T>(loader: (runtime: RuntimeRiot) => Promise<T>) {
  const runtime = getRuntimeRiot();
  if (!runtime) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(runtime) }; }
  catch {
    return { state: "error" as const };
  }
}
