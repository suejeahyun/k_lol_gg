import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { formatRecruitPartyBlock, getActiveMemberCount, getKakaoRecruitDateKey } from "@/lib/kakao/party-recruit";
import { getLatestRecruitResetLog } from "@/lib/kakao/recruit-reset";

export const AUTO_IDLE_FINISH_CONFIG_ACTION = "AUTO_IDLE_FINISH_CONFIG";
export const AUTO_IDLE_FINISH_ACTION = "AUTO_IDLE_FINISH";
export const DEFAULT_RECRUIT_IDLE_FINISH_HOURS = 3;
export const MIN_RECRUIT_IDLE_FINISH_HOURS = 1;
export const MAX_RECRUIT_IDLE_FINISH_HOURS = 72;
export const AUTO_IDLE_FINISH_LIMIT = 30;

type AutoFinishSettings = {
  enabled: boolean;
  idleHours: number;
};

function clampIdleHours(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RECRUIT_IDLE_FINISH_HOURS;
  return Math.min(MAX_RECRUIT_IDLE_FINISH_HOURS, Math.max(MIN_RECRUIT_IDLE_FINISH_HOURS, Math.floor(parsed)));
}

function parseSettings(summary: string | null): AutoFinishSettings | null {
  if (!summary) return null;

  try {
    const parsed = JSON.parse(summary) as Partial<AutoFinishSettings>;
    return {
      enabled: parsed.enabled !== false,
      idleHours: clampIdleHours(parsed.idleHours),
    };
  } catch {
    return null;
  }
}

export async function getRecruitIdleAutoFinishSettings(): Promise<AutoFinishSettings> {
  const latest = await prisma.recruitPartyLog.findFirst({
    where: { action: AUTO_IDLE_FINISH_CONFIG_ACTION },
    orderBy: { createdAt: "desc" },
    select: { summary: true },
  });

  return parseSettings(latest?.summary ?? null) ?? {
    enabled: false,
    idleHours: DEFAULT_RECRUIT_IDLE_FINISH_HOURS,
  };
}

export async function saveRecruitIdleAutoFinishSettings(params: {
  enabled: boolean;
  idleHours: number;
  roomName?: string | null;
  sender?: string | null;
}) {
  const settings: AutoFinishSettings = {
    enabled: params.enabled,
    idleHours: clampIdleHours(params.idleHours),
  };
  const recruitDate = getKakaoRecruitDateKey();
  const latestReset = await getLatestRecruitResetLog(recruitDate);

  return prisma.recruitPartyLog.create({
    data: {
      recruitNo: 0,
      recruitDate,
      resetSeq: latestReset?.resetSeq ?? 0,
      type: "SYSTEM",
      title: "활동 없음 자동 구인종료 설정 변경",
      action: AUTO_IDLE_FINISH_CONFIG_ACTION,
      memberCount: 0,
      maxMembers: 0,
      summary: JSON.stringify(settings),
      roomName: params.roomName ?? "admin",
      sender: params.sender ?? "admin",
    },
  });
}

export async function runRecruitIdleAutoFinishIfNeeded(params: {
  now?: Date;
  source?: string;
  roomName?: string | null;
  sender?: string | null;
} = {}) {
  const now = params.now ?? new Date();
  const settings = await getRecruitIdleAutoFinishSettings();

  if (!settings.enabled) {
    return { executed: false, reason: "disabled" as const, settings, finishedCount: 0 };
  }

  const thresholdAt = new Date(now.getTime() - settings.idleHours * 60 * 60 * 1000);

  const parties = await prisma.recruitParty.findMany({
    where: {
      status: "IN_PROGRESS",
      updatedAt: { lte: thresholdAt },
    },
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: AUTO_IDLE_FINISH_LIMIT,
  });

  if (parties.length === 0) {
    return {
      executed: false,
      reason: "no_expired_recruits" as const,
      settings,
      thresholdAt,
      finishedCount: 0,
    };
  }

  const finished = [] as Array<{ id: number; recruitNo: number; title: string; updatedAt: Date }>;

  for (const party of parties) {
    const activeMemberCount = getActiveMemberCount(party.members);
    const summary = [
      `활동 없음 자동종료: ${settings.idleHours}시간 이상 업데이트 없음`,
      `마지막 수정: ${party.updatedAt.toISOString()}`,
      `실행 출처: ${params.source ?? "system"}`,
      "",
      formatRecruitPartyBlock(party),
    ].join("\n");

    await prisma.$transaction(async (tx) => {
      const current = await tx.recruitParty.findFirst({
        where: {
          id: party.id,
          status: "IN_PROGRESS",
          updatedAt: { lte: thresholdAt },
        },
        select: { id: true },
      });

      if (!current) return;

      await tx.recruitPartyLog.create({
        data: {
          recruitNo: party.recruitNo,
          recruitDate: party.recruitDate,
          resetSeq: party.resetSeq,
          type: String(party.type),
          title: party.title,
          action: AUTO_IDLE_FINISH_ACTION,
          memberCount: activeMemberCount,
          maxMembers: party.maxMembers,
          summary,
          roomName: params.roomName ?? party.roomName ?? "auto-idle-finish",
          sender: params.sender ?? "system",
        },
      });

      await tx.recruitParty.update({
        where: { id: party.id },
        data: { status: "FINISHED" },
      });

      await writeAdminLog({
        action: "KAKAO_PARTY_RECRUIT_AUTO_IDLE_FINISH",
        message: `카카오 구인구직 활동 없음 자동종료: #${party.recruitNo} ${party.title}`,
        targetType: "RecruitParty",
        targetId: party.id,
        afterJson: {
          recruitNo: party.recruitNo,
          recruitDate: party.recruitDate,
          resetSeq: party.resetSeq,
          idleHours: settings.idleHours,
          lastUpdatedAt: party.updatedAt.toISOString(),
          source: params.source ?? "system",
        },
        db: tx,
      });
    });

    finished.push({
      id: party.id,
      recruitNo: party.recruitNo,
      title: party.title,
      updatedAt: party.updatedAt,
    });
  }

  return {
    executed: true,
    reason: "auto_idle_finish" as const,
    settings,
    thresholdAt,
    finishedCount: finished.length,
    finished,
  };
}
