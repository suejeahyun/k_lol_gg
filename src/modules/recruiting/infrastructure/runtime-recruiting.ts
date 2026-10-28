import "server-only";

import { getDatabase } from "@/platform/db/client";

import { RecruitingApplicationError, RecruitingCommandHandler } from "../application/command-handler";
import { isCommunityRecruitingNewWork } from "@/modules/community-sites/domain/module-access";
import { isRuntimeCommunityModuleEnabled } from "@/modules/community-sites/infrastructure/module-access";
import type { RecruitingCommand } from "../application/commands";
import type { RecruitingCompatTargetInput, RecruitingPartyReplayInput } from "../application/ports";
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

  async handle(command: RecruitingCommand) {
    if (isCommunityRecruitingNewWork(command.type) && !await isRuntimeCommunityModuleEnabled("recruiting")) {
      throw new RecruitingApplicationError("FORBIDDEN", "이 커뮤니티의 새 모집·참가 접수가 중지되어 있습니다.");
    }
    return this.handler.handle(command);
  }

  resolveCompatTarget(input: RecruitingCompatTargetInput) {
    return this.adapter.resolveCompatTarget(input);
  }

  findPartyEventReplay(input: RecruitingPartyReplayInput) {
    return this.adapter.findPartyEventReplay(input);
  }

  resolvePartyRecruitCode(input: Readonly<{ sourceRoomId: string; code: string }>) {
    return this.adapter.resolvePartyRecruitCode(input);
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

  getPartyMemberStats(query: string) {
    return this.adapter.getPartyMemberStats(query);
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
