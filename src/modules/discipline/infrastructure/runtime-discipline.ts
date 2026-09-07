import "server-only";

import { PrivateAssetService } from "@/modules/assets/application/private-asset-service";
import { UnavailablePrivateImageStorage } from "@/modules/matches/infrastructure/private-image";
import { getRuntimePrivateImageStorage } from "@/modules/matches/infrastructure/runtime-private-assets";
import { getDatabase } from "@/platform/db/client";

import { DisciplineCommandHandler } from "../application/command-handler";
import type { DisciplineCommand } from "../application/commands";
import {
  DisciplineAssetInspector,
  DisabledPrivateAssetReadGrant,
  disciplineAssetStorageKeys,
  randomAssetIdentity,
} from "./discipline-private-assets";
import { PostgresDisciplineAdapter } from "./postgres-discipline-adapter";

const disciplineClock = {
  now: () => new Date(),
  receiptExpiresAt: (now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1_000),
};

export class RuntimeDisciplineService {
  readonly assets: PrivateAssetService;
  private readonly commands: DisciplineCommandHandler;

  constructor(readonly adapter: PostgresDisciplineAdapter) {
    this.commands = new DisciplineCommandHandler({
      unitOfWork: adapter,
      repository: adapter,
      authorization: adapter,
      receipts: adapter,
      audit: adapter.auditPort(),
      outbox: adapter.outboxPort(),
      clock: disciplineClock,
    });
    this.assets = new PrivateAssetService({
      unitOfWork: adapter,
      repository: adapter,
      authorization: adapter,
      audit: adapter.assetAuditPort(),
      inspection: new DisciplineAssetInspector(),
      storage: getRuntimePrivateImageStorage() ?? new UnavailablePrivateImageStorage(),
      readGrants: new DisabledPrivateAssetReadGrant(),
      assetIds: randomAssetIdentity,
      eventIds: randomAssetIdentity,
      storageKeys: disciplineAssetStorageKeys,
      clock: { now: () => new Date().toISOString() },
    });
  }

  handle(command: DisciplineCommand) { return this.commands.handle(command); }
}

declare global {
  var __klolV2RuntimeDiscipline: RuntimeDisciplineService | undefined;
}

export function getRuntimeDisciplineService() {
  try {
    if (!globalThis.__klolV2RuntimeDiscipline) {
      globalThis.__klolV2RuntimeDiscipline = new RuntimeDisciplineService(new PostgresDisciplineAdapter(getDatabase()));
    }
    return globalThis.__klolV2RuntimeDiscipline;
  } catch {
    return null;
  }
}

export async function loadRuntimeDiscipline<T>(loader: (service: RuntimeDisciplineService) => Promise<T>) {
  const service = getRuntimeDisciplineService();
  if (!service) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(service) }; }
  catch { return { state: "error" as const }; }
}
