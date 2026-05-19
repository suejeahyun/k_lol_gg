import { prisma } from "@/lib/prisma/client";
import { getKakaoRecruitDateKey } from "@/lib/kakao/party-recruit";
import { getLatestRecruitResetLog, resetRecruitNumbers } from "@/lib/kakao/recruit-reset";

export const AUTO_IDLE_RESET_CONFIG_ACTION = "AUTO_IDLE_RESET_CONFIG";
export const AUTO_IDLE_RESET_ACTION = "AUTO_IDLE_RESET";
export const DEFAULT_RECRUIT_IDLE_RESET_HOURS = 6;
export const MIN_RECRUIT_IDLE_RESET_HOURS = 1;
export const MAX_RECRUIT_IDLE_RESET_HOURS = 72;

type AutoResetSettings = {
  enabled: boolean;
  idleHours: number;
};

function clampIdleHours(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RECRUIT_IDLE_RESET_HOURS;
  return Math.min(MAX_RECRUIT_IDLE_RESET_HOURS, Math.max(MIN_RECRUIT_IDLE_RESET_HOURS, Math.floor(parsed)));
}

function parseSettings(summary: string | null): AutoResetSettings | null {
  if (!summary) return null;

  try {
    const parsed = JSON.parse(summary) as Partial<AutoResetSettings>;
    return {
      enabled: parsed.enabled !== false,
      idleHours: clampIdleHours(parsed.idleHours),
    };
  } catch {
    return null;
  }
}

export async function getRecruitAutoResetSettings(): Promise<AutoResetSettings> {
  const latest = await prisma.recruitPartyLog.findFirst({
    where: { action: AUTO_IDLE_RESET_CONFIG_ACTION },
    orderBy: { createdAt: "desc" },
    select: { summary: true },
  });

  return parseSettings(latest?.summary ?? null) ?? {
    enabled: true,
    idleHours: DEFAULT_RECRUIT_IDLE_RESET_HOURS,
  };
}

export async function saveRecruitAutoResetSettings(params: {
  enabled: boolean;
  idleHours: number;
  roomName?: string | null;
  sender?: string | null;
}) {
  const settings: AutoResetSettings = {
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
      title: "자동 모집번호 초기화 설정 변경",
      action: AUTO_IDLE_RESET_CONFIG_ACTION,
      memberCount: 0,
      maxMembers: 0,
      summary: JSON.stringify(settings),
      roomName: params.roomName ?? "admin",
      sender: params.sender ?? "admin",
    },
  });
}

async function getLatestBusinessActivityAt() {
  const [latestParty, latestLog] = await Promise.all([
    prisma.recruitParty.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.recruitPartyLog.findFirst({
      where: {
        action: {
          notIn: [
            "RESET",
            AUTO_IDLE_RESET_ACTION,
            AUTO_IDLE_RESET_CONFIG_ACTION,
            "ADMIN_RESET_ALL",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const candidates = [latestParty?.updatedAt, latestLog?.createdAt].filter(Boolean) as Date[];
  if (candidates.length === 0) return null;

  return candidates.reduce((latest, candidate) => (candidate.getTime() > latest.getTime() ? candidate : latest));
}

export async function runRecruitIdleAutoResetIfNeeded(params: {
  roomName?: string | null;
  sender?: string | null;
  now?: Date;
} = {}) {
  const now = params.now ?? new Date();
  const settings = await getRecruitAutoResetSettings();

  if (!settings.enabled) {
    return { executed: false, reason: "disabled" as const, settings };
  }

  const activeCount = await prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } });
  if (activeCount > 0) {
    return { executed: false, reason: "active_recruits_exist" as const, activeCount, settings };
  }

  const lastActivityAt = await getLatestBusinessActivityAt();
  if (!lastActivityAt) {
    return { executed: false, reason: "no_activity" as const, settings };
  }

  const recruitDate = getKakaoRecruitDateKey(now);
  const latestReset = await getLatestRecruitResetLog(recruitDate);

  if (latestReset && latestReset.createdAt.getTime() >= lastActivityAt.getTime()) {
    return {
      executed: false,
      reason: "already_reset_after_last_activity" as const,
      lastActivityAt,
      settings,
    };
  }

  const idleMs = now.getTime() - lastActivityAt.getTime();
  const requiredMs = settings.idleHours * 60 * 60 * 1000;

  if (idleMs < requiredMs) {
    return {
      executed: false,
      reason: "idle_time_not_enough" as const,
      idleMs,
      requiredMs,
      lastActivityAt,
      settings,
    };
  }

  const result = await resetRecruitNumbers({
    recruitDate,
    roomName: params.roomName ?? "auto-idle-reset",
    sender: params.sender ?? "system",
    action: AUTO_IDLE_RESET_ACTION,
    title: "활동 없음 자동 모집번호 초기화",
    summary: `진행 중 구인글이 없고 마지막 구인 활동 후 ${settings.idleHours}시간 이상 지나 자동으로 모집번호 회차를 초기화했습니다.`,
  });

  return {
    executed: true,
    reason: "auto_idle_reset" as const,
    result,
    lastActivityAt,
    settings,
  };
}
