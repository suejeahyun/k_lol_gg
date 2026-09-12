import "server-only";

import { getDatabase } from "@/platform/db/client";

import { RecruitingCommandHandler } from "../application/command-handler";
import type { RecruitingCommand } from "../application/commands";
import type { RecruitingCompatTargetInput } from "../application/ports";
import { PostgresRecruitingAdapter } from "./postgres-recruiting-adapter";

const clock = {
  now: () => new Date(),
  receiptExpiresAt: (now: Date) => new Date(now.getTime() + 24 * 60 * 60 * 1_000),
};

export class RuntimeRecruitingService {
  private readonly handler: RecruitingCommandHandler;

  constructor(readonly adapter: PostgresRecruitingAdapter) {
    this.handler = new RecruitingCommandHandler({
      unitOfWork: adapter,
      repository: adapter,
      authorization: adapter,
      receipts: adapter,
      audit: adapter.auditPort(),
      outbox: adapter.outboxPort(),
      clock,
    });
  }

  handle(command: RecruitingCommand) {
    return this.handler.handle(command);
  }

  resolveCompatTarget(input: RecruitingCompatTargetInput) {
    return this.adapter.resolveCompatTarget(input);
  }

  resolveScrimUpsert(input: Readonly<{
    sourceRoomId: string;
    recruitDate: string;
    requestedScrimNumber: number | null;
  }>) {
    return this.adapter.resolveScrimUpsert(input);
  }

  listPublicFeed() {
    return this.adapter.listPublicFeed();
  }

  getAdminStatus() {
    return this.adapter.getAdminStatus();
  }
}

export function getRuntimeRecruitingService() {
  try {
    return new RuntimeRecruitingService(new PostgresRecruitingAdapter(getDatabase()));
  } catch {
    return null;
  }
}

export async function loadRuntimeRecruiting<T>(loader: (service: RuntimeRecruitingService) => Promise<T>) {
  const service = getRuntimeRecruitingService();
  if (!service) return { state: "unavailable" as const };
  try {
    return { state: "ready" as const, data: await loader(service) };
  } catch {
    return { state: "error" as const };
  }
}
