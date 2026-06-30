export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";
import { getDiscordOperationSettings } from "@/lib/discord/settings";

const SOURCE_REF_TYPE = "RECRUIT_LATE";
const CREATED_BY = "DISCORD_RECRUIT_LATE_BOT";
const LOOKBACK_HOURS = 12;

type CurrentVoiceMember = {
  id?: string;
  discordId?: string;
  displayName?: string | null;
  memberDisplayName?: string | null;
  nickname?: string | null;
  memberNickname?: string | null;
  username?: string | null;
  globalName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
};

type Body = {
  secret?: string;
  source?: string;
  currentDiscordIds?: string[];
  currentMembers?: CurrentVoiceMember[];
  graceMinutes?: number;
  dmEnabled?: boolean;
  dryRun?: boolean;
};

type PreparedVoiceMember = {
  id: string;
  displayName: string;
  channelId: string | null;
  channelName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  extractedNames: Set<string>;
};

type ParticipantCheck = {
  memberId: number;
  slotNo: number | null;
  name: string;
  playerId: number | null;
  userAccountId: number | null;
  targetNickname: string | null;
  targetTag: string | null;
  linkedDiscordId: string | null;
  present: boolean;
  matchedDiscordId: string | null;
  matchedDisplayName: string | null;
  matchedChannelName: string | null;
  matchType: "DISCORD_ID" | "NAME_TOKEN" | "NAME_AMBIGUOUS" | "PLAYER_AMBIGUOUS" | "NOT_MATCHED";
  confidence: "EXACT" | "HIGH" | "CHECK_REQUIRED" | "NONE";
  skipReason?: string;
};

function normalizeName(value: string | null | undefined) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s#·ㆍ_\-\.\/\\|()[\]{}]+/g, "")
    .toLowerCase();
}

function isNonEmptyName(value: string | null | undefined) {
  return String(value || "").trim() !== "";
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function compactDisplayName(member: CurrentVoiceMember) {
  return String(
    member.displayName
    || member.memberDisplayName
    || member.nickname
    || member.memberNickname
    || member.globalName
    || member.username
    || member.id
    || member.discordId
    || "Discord 유저"
  ).trim();
}

function isAgeToken(token: string) {
  const value = token.trim().toLowerCase();
  return /^\d{2,4}$/.test(value)
    || /^\d{2,4}년생$/.test(value)
    || /^\d{2}년$/.test(value)
    || /^(19|20)\d{2}$/.test(value);
}

function isLineToken(token: string) {
  return /^[a-z]{1,4}\([a-z]{1,4}\)$/i.test(token.trim()) || /^[탑정글미드원딜서폿올라운더]{1,6}$/i.test(token.trim());
}

function isKoreanNameToken(token: string) {
  const value = token.trim();
  if (isAgeToken(value) || isLineToken(value)) return false;
  return /^[가-힣]{2,4}$/.test(value);
}

function extractPossibleNamesFromDiscordName(displayName: string) {
  const tokens = String(displayName || "")
    .replace(/[\[\]{}()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const names: string[] = [];
  if (tokens.length >= 2 && isAgeToken(tokens[0]) && isKoreanNameToken(tokens[1])) names.push(tokens[1]);
  if (tokens.length >= 1 && isKoreanNameToken(tokens[0])) names.push(tokens[0]);
  for (const token of tokens) {
    if (isKoreanNameToken(token)) names.push(token);
  }

  return new Set(unique(names.map(normalizeName).filter(Boolean)));
}

function prepareVoiceMembers(body: Body, currentDiscordIds: Set<string>) {
  const prepared = new Map<string, PreparedVoiceMember>();
  const fromMembers = Array.isArray(body.currentMembers) ? body.currentMembers : [];

  for (const member of fromMembers) {
    const id = String(member.id || member.discordId || "").trim();
    if (!id) continue;
    currentDiscordIds.add(id);
    if (prepared.has(id)) continue;
    const displayName = compactDisplayName(member);
    prepared.set(id, {
      id,
      displayName,
      channelId: member.channelId ? String(member.channelId) : null,
      channelName: member.channelName ? String(member.channelName) : null,
      categoryId: member.categoryId ? String(member.categoryId) : null,
      categoryName: member.categoryName ? String(member.categoryName) : null,
      extractedNames: extractPossibleNamesFromDiscordName(displayName),
    });
  }

  for (const id of currentDiscordIds) {
    if (!prepared.has(id)) {
      prepared.set(id, {
        id,
        displayName: `Discord ${id.slice(-4)}`,
        channelId: null,
        channelName: null,
        categoryId: null,
        categoryName: null,
        extractedNames: new Set(),
      });
    }
  }

  return [...prepared.values()];
}

function formatKstDateTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour24 = Number(get("hour")) % 24;
  const minute = get("minute");
  const marker = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${year}. ${month}. ${day}. ${marker} ${String(hour12).padStart(2, "0")}:${minute}`;
}

function formatPartyTitle(party: { recruitNo: number; title: string; maxMembers: number }) {
  return `#${party.recruitNo} · ${party.title || `${party.maxMembers}인 파티`}`;
}

function buildDmMessage(params: {
  party: { recruitNo: number; title: string; maxMembers: number; startTimeText: string | null; scheduledStartAt: Date | null };
  activeWarningCount: number;
  graceMinutes: number;
}) {
  const { party, activeWarningCount, graceMinutes } = params;
  const startText = party.startTimeText || (party.scheduledStartAt ? formatKstDateTime(party.scheduledStartAt) : "-");
  return [
    "[K-LOL.GG 구인 지각 주의 안내]",
    "",
    "참여한 구인의 시작시간이 지났지만 디스코드 접속이 확인되지 않아 지각 주의가 등록되었습니다.",
    "",
    `구인: ${formatPartyTitle(party)}`,
    `시작시간: ${startText}`,
    `판정기준: 시작시간 + ${graceMinutes}분`,
    "",
    `현재 활성 주의: ${activeWarningCount}개`,
    "",
    "오류가 있거나 이미 접속했었다면 운영진에게 확인 요청해주세요.",
  ].join("\n");
}

function buildAdminMessage(params: {
  createdWarnings: Array<{
    targetName: string;
    recruitNo: number;
    title: string;
    maxMembers: number;
    startTimeText: string | null;
    scheduledStartAt: string | null;
    activeWarningCount: number;
    discordUserId: string | null;
    discordDmStatus: string;
  }>;
  skipped: Array<{ targetName: string; recruitNo: number; reason: string }>;
  graceMinutes: number;
}) {
  const grouped = new Map<string, typeof params.createdWarnings>();
  for (const warning of params.createdWarnings) {
    const key = `#${warning.recruitNo} ${warning.title}`;
    grouped.set(key, [...(grouped.get(key) || []), warning]);
  }

  const lines: string[] = ["[K-LOL.GG 구인 지각 주의]", ""];
  lines.push(`판정기준: 시작시간 + ${params.graceMinutes}분`);
  lines.push("");

  for (const [key, warnings] of grouped.entries()) {
    const first = warnings[0];
    const startText = first.startTimeText || (first.scheduledStartAt ? formatKstDateTime(new Date(first.scheduledStartAt)) : "-");
    lines.push(`${key} · 시작시간: ${startText}`);
    warnings.forEach((warning, index) => {
      const dmText = warning.discordDmStatus === "PENDING" ? "DM 예정" : warning.discordDmStatus === "SKIPPED" ? "DM 불가" : warning.discordDmStatus;
      lines.push(`${index + 1}. ${warning.targetName} - 활성 주의 ${warning.activeWarningCount}개 / ${dmText}`);
    });
    lines.push("");
  }

  const relatedSkipped = params.skipped.filter((item) => params.createdWarnings.some((warning) => warning.recruitNo === item.recruitNo));
  if (relatedSkipped.length > 0) {
    lines.push("자동 제외/수동확인:");
    for (const item of relatedSkipped.slice(0, 12)) lines.push(`- #${item.recruitNo} ${item.targetName}: ${item.reason}`);
    lines.push("");
  }

  lines.push("확인: 관리자 > 운영 > 운영 경고 관리");
  return lines.join("\n").slice(0, 1900);
}

async function getActiveWarningCount(identity: { userAccountId: number | null; playerId: number | null; targetName: string }) {
  if (identity.userAccountId) {
    return prisma.userDisciplineRecord.count({ where: { isActive: true, type: "CAUTION", userAccountId: identity.userAccountId } });
  }
  if (identity.playerId) {
    return prisma.userDisciplineRecord.count({ where: { isActive: true, type: "CAUTION", playerId: identity.playerId } });
  }
  return prisma.userDisciplineRecord.count({ where: { isActive: true, type: "CAUTION", targetName: identity.targetName } });
}

function getDuplicateErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : "";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Body;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const settings = await getDiscordOperationSettings();
  if (!settings.recruitLateWarningEnabled) {
    return NextResponse.json({ ok: true, disabled: true, createdWarnings: [], skipped: [], adminMessage: "" });
  }

  const graceMinutes = Number.isFinite(Number(body.graceMinutes))
    ? Math.max(0, Math.min(120, Math.round(Number(body.graceMinutes))))
    : settings.recruitLateWarningGraceMinutes;
  const dmEnabled = typeof body.dmEnabled === "boolean" ? body.dmEnabled : settings.recruitLateWarningDmEnabled;
  const dryRun = Boolean(body.dryRun);
  const source = String(body.source || "INTERVAL").trim();

  const now = new Date();
  const threshold = new Date(now.getTime() - graceMinutes * 60 * 1000);
  const lookback = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const currentDiscordIds = new Set((body.currentDiscordIds || []).map((id) => String(id).trim()).filter(Boolean));
  const currentVoiceMembers = prepareVoiceMembers(body, currentDiscordIds);
  const currentMemberById = new Map(currentVoiceMembers.map((member) => [member.id, member]));

  const parties = await prisma.recruitParty.findMany({
    where: {
      status: "IN_PROGRESS",
      scheduledStartAt: { not: null, lte: threshold, gte: lookback },
    },
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ scheduledStartAt: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });

  const createdWarnings: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const party of parties) {
    const activeMembers = party.members.filter((member) => isNonEmptyName(member.name) && !member.isSubstitute);
    if (activeMembers.length === 0) continue;

    const memberNames = activeMembers.map((member) => member.name.trim());
    const normalizedMemberNames = new Set(memberNames.map(normalizeName));
    const nameCount = new Map<string, number>();
    for (const name of memberNames) {
      const key = normalizeName(name);
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    }

    const players = memberNames.length > 0
      ? await prisma.player.findMany({
          where: {
            isActive: true,
            OR: memberNames.flatMap((name) => ([
              { name: { equals: name, mode: "insensitive" as const } },
              { nickname: { equals: name, mode: "insensitive" as const } },
            ])),
          },
          include: { userAccount: true },
        })
      : [];

    const playerCandidatesByMemberName = new Map<string, typeof players>();
    for (const player of players) {
      const keys = [normalizeName(player.name), normalizeName(player.nickname)];
      for (const key of keys) {
        if (!normalizedMemberNames.has(key)) continue;
        playerCandidatesByMemberName.set(key, [...(playerCandidatesByMemberName.get(key) || []), player]);
      }
    }

    const usedDiscordIds = new Set<string>();
    const participantChecks: ParticipantCheck[] = activeMembers.map((member) => {
      const key = normalizeName(member.name);
      const playerCandidates = playerCandidatesByMemberName.get(key) || [];
      const uniquePlayerIds = unique(playerCandidates.map((player) => player.id));
      const player = uniquePlayerIds.length === 1 ? playerCandidates.find((item) => item.id === uniquePlayerIds[0]) || null : null;
      const playerAmbiguous = uniquePlayerIds.length > 1;
      const discordId = player?.userAccount?.discordId || null;
      const directMember = discordId ? currentMemberById.get(discordId) : null;

      if (playerAmbiguous) {
        return {
          memberId: member.id,
          slotNo: member.slotNo ?? null,
          name: member.name.trim(),
          playerId: null,
          userAccountId: null,
          targetNickname: null,
          targetTag: null,
          linkedDiscordId: null,
          present: false,
          matchedDiscordId: null,
          matchedDisplayName: null,
          matchedChannelName: null,
          matchType: "PLAYER_AMBIGUOUS",
          confidence: "CHECK_REQUIRED",
          skipReason: "사이트 플레이어 후보가 2명 이상입니다.",
        };
      }

      if (directMember) {
        usedDiscordIds.add(directMember.id);
        return {
          memberId: member.id,
          slotNo: member.slotNo ?? null,
          name: member.name.trim(),
          playerId: player?.id ?? null,
          userAccountId: player?.userAccountId ?? null,
          targetNickname: player?.nickname ?? null,
          targetTag: player?.tag ?? null,
          linkedDiscordId: discordId,
          present: true,
          matchedDiscordId: directMember.id,
          matchedDisplayName: directMember.displayName,
          matchedChannelName: directMember.channelName,
          matchType: "DISCORD_ID",
          confidence: "EXACT",
        };
      }

      return {
        memberId: member.id,
        slotNo: member.slotNo ?? null,
        name: member.name.trim(),
        playerId: player?.id ?? null,
        userAccountId: player?.userAccountId ?? null,
        targetNickname: player?.nickname ?? null,
        targetTag: player?.tag ?? null,
        linkedDiscordId: discordId,
        present: false,
        matchedDiscordId: null,
        matchedDisplayName: null,
        matchedChannelName: null,
        matchType: "NOT_MATCHED",
        confidence: "NONE",
      };
    });

    for (const check of participantChecks) {
      if (check.present || check.matchType === "PLAYER_AMBIGUOUS") continue;
      const key = normalizeName(check.name);
      if ((nameCount.get(key) || 0) !== 1) {
        check.matchType = "NAME_AMBIGUOUS";
        check.confidence = "CHECK_REQUIRED";
        check.skipReason = "구인 명단 안에서 같은 이름이 2명 이상입니다.";
        continue;
      }

      const candidates = currentVoiceMembers.filter((voiceMember) => !usedDiscordIds.has(voiceMember.id) && voiceMember.extractedNames.has(key));
      if (candidates.length === 1) {
        const matched = candidates[0];
        usedDiscordIds.add(matched.id);
        check.present = true;
        check.matchedDiscordId = matched.id;
        check.matchedDisplayName = matched.displayName;
        check.matchedChannelName = matched.channelName;
        check.matchType = "NAME_TOKEN";
        check.confidence = "HIGH";
      } else if (candidates.length > 1) {
        check.matchType = "NAME_AMBIGUOUS";
        check.confidence = "CHECK_REQUIRED";
        check.skipReason = "디스코드 이름 후보가 2명 이상입니다.";
      }
    }

    for (const check of participantChecks) {
      if (check.present) continue;

      if (check.matchType === "NAME_AMBIGUOUS" || check.matchType === "PLAYER_AMBIGUOUS") {
        skipped.push({
          partyId: party.id,
          recruitNo: party.recruitNo,
          targetName: check.name,
          reason: check.skipReason || "매칭 후보가 애매하여 자동 주의에서 제외했습니다.",
          matchType: check.matchType,
        });
        continue;
      }

      const sourceRefKey = `${SOURCE_REF_TYPE}:${party.id}:${check.memberId}`;
      const existing = await prisma.userDisciplineRecord.findUnique({ where: { sourceRefKey } });
      if (existing) {
        skipped.push({
          partyId: party.id,
          recruitNo: party.recruitNo,
          targetName: check.name,
          reason: "이미 같은 구인에서 지각 주의가 등록되어 있습니다.",
          matchType: "DUPLICATE",
          recordId: existing.id,
        });
        continue;
      }

      const dmStatus = !dmEnabled ? "DISABLED" : check.linkedDiscordId ? "PENDING" : "SKIPPED";
      const reason = `${formatPartyTitle(party)} 시작시간 경과 후 디스코드 접속 미확인 · 시작시간: ${party.startTimeText || (party.scheduledStartAt ? formatKstDateTime(party.scheduledStartAt) : "-")} · 판정기준: 시작시간 + ${graceMinutes}분`;
      const note = "자동 등록 · 카카오톡 구인 지각 주의 · 디스코드 감시 음성방 기준 미접속";
      const sourceMeta = {
        source,
        partyId: party.id,
        recruitNo: party.recruitNo,
        recruitDate: party.recruitDate,
        resetSeq: party.resetSeq,
        title: party.title,
        maxMembers: party.maxMembers,
        memberId: check.memberId,
        slotNo: check.slotNo,
        memberName: check.name,
        startTimeText: party.startTimeText,
        scheduledStartAt: party.scheduledStartAt?.toISOString() ?? null,
        judgedAt: now.toISOString(),
        graceMinutes,
        lookbackHours: LOOKBACK_HOURS,
        matchType: check.matchType,
        confidence: check.confidence,
        linkedDiscordId: check.linkedDiscordId,
        currentVoiceMemberCount: currentVoiceMembers.length,
      };

      if (dryRun) {
        createdWarnings.push({
          recordId: null,
          dryRun: true,
          partyId: party.id,
          recruitNo: party.recruitNo,
          title: party.title,
          maxMembers: party.maxMembers,
          startTimeText: party.startTimeText,
          scheduledStartAt: party.scheduledStartAt?.toISOString() ?? null,
          targetName: check.name,
          discordUserId: check.linkedDiscordId,
          discordDmStatus: dmStatus,
          activeWarningCount: await getActiveWarningCount({ userAccountId: check.userAccountId, playerId: check.playerId, targetName: check.name }),
          dmMessage: "",
        });
        continue;
      }

      try {
        const created = await prisma.userDisciplineRecord.create({
          data: {
            userAccountId: check.userAccountId,
            playerId: check.playerId,
            targetName: check.name,
            targetNickname: check.targetNickname,
            targetTag: check.targetTag,
            type: "CAUTION",
            source: "LATE",
            reason,
            note,
            sourceRefType: SOURCE_REF_TYPE,
            sourceRefId: String(party.id),
            sourceRefKey,
            sourceMeta: JSON.parse(JSON.stringify(sourceMeta)) as Prisma.InputJsonValue,
            discordUserId: check.linkedDiscordId,
            discordDmStatus: dmStatus,
            createdBy: CREATED_BY,
          },
        });

        const activeWarningCount = await getActiveWarningCount({ userAccountId: check.userAccountId, playerId: check.playerId, targetName: check.name });
        const dmMessage = check.linkedDiscordId && dmEnabled
          ? buildDmMessage({ party, activeWarningCount, graceMinutes })
          : "";

        createdWarnings.push({
          recordId: created.id,
          partyId: party.id,
          recruitNo: party.recruitNo,
          title: party.title,
          maxMembers: party.maxMembers,
          startTimeText: party.startTimeText,
          scheduledStartAt: party.scheduledStartAt?.toISOString() ?? null,
          targetName: check.name,
          targetNickname: check.targetNickname,
          targetTag: check.targetTag,
          userAccountId: check.userAccountId,
          playerId: check.playerId,
          discordUserId: check.linkedDiscordId,
          discordDmStatus: dmStatus,
          activeWarningCount,
          dmMessage,
        });
      } catch (error) {
        if (getDuplicateErrorCode(error) === "P2002") {
          skipped.push({ partyId: party.id, recruitNo: party.recruitNo, targetName: check.name, reason: "중복 방지 키 충돌로 등록하지 않았습니다.", matchType: "DUPLICATE" });
          continue;
        }
        throw error;
      }
    }
  }

  const typedWarnings = createdWarnings.map((warning) => ({
    targetName: String(warning.targetName || "-"),
    recruitNo: Number(warning.recruitNo || 0),
    title: String(warning.title || ""),
    maxMembers: Number(warning.maxMembers || 0),
    startTimeText: typeof warning.startTimeText === "string" ? warning.startTimeText : null,
    scheduledStartAt: typeof warning.scheduledStartAt === "string" ? warning.scheduledStartAt : null,
    activeWarningCount: Number(warning.activeWarningCount || 0),
    discordUserId: typeof warning.discordUserId === "string" ? warning.discordUserId : null,
    discordDmStatus: String(warning.discordDmStatus || "SKIPPED"),
  }));
  const typedSkipped = skipped.map((item) => ({
    targetName: String(item.targetName || "-"),
    recruitNo: Number(item.recruitNo || 0),
    reason: String(item.reason || "-"),
  }));
  const adminMessage = createdWarnings.length > 0 ? buildAdminMessage({ createdWarnings: typedWarnings, skipped: typedSkipped, graceMinutes }) : "";

  return NextResponse.json({
    ok: true,
    source,
    dryRun,
    serverTime: now.toISOString(),
    graceMinutes,
    dmEnabled,
    currentVoiceMemberCount: currentVoiceMembers.length,
    checkedPartyCount: parties.length,
    createdWarnings,
    skipped,
    adminMessage,
  });
}
