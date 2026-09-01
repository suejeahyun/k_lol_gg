import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import {
  getKakaoMessageValidationError,
  isKakaoNameTooLong,
  MAX_KAKAO_NAME_LENGTH,
} from "@/lib/kakao/input-guard";
import { acquirePartyRecruitLock } from "@/lib/kakao/db-lock";
import { expirePartyRecruitDrafts } from "@/lib/kakao/recruit-draft";
import {
  buildSyncReply,
  extractRecruitNoFromForm,
  extractRecruitNosFromForm,
  findNumberedSlotsAboveMaxMembers,
  getKakaoRecruitDateKey,
  getKakaoRecruitTodayRange,
  isLinePartyType,
  isSoloRankPartyType,
  parsePartyForm,
  parseRecruitScheduledStartAt,
  promotePartySubstitutesAfterRemoval,
  stripAppendedRecruitStatusSummary,
} from "@/lib/kakao/party-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import { appendRecruitStatusSummary } from "@/lib/kakao/recruit-status-summary";
import { evaluatePartyMutationOwnership } from "@/lib/kakao/policy";
import { getKakaoOperationSettings } from "@/lib/kakao/settings";
import { logServerError } from "@/lib/server/safe-log";
import { POST as applySeasonRecruit } from "../../recruit/season-apply/route";
import {
  getBodyRoom,
  getBodySender,
  getBodyText,
  partyRecruitJson,
  readJsonBody,
  rejectIfInvalidPartySecret,
  rejectPartyPolicy,
} from "../_shared";

async function findActiveRecruitParty(params: {
  recruitNo: number;
}) {
  const { recruitNo } = params;

  // 번호가 전역에서 유일할 때만 수정합니다.
  // 기존 데이터에 같은 활성 번호가 둘 이상 있으면 잘못된 파티를 덮어쓰지 않습니다.
  const activeParties = await prisma.recruitParty.findMany({
    where: {
      recruitNo,
      status: { in: ["DRAFT", "IN_PROGRESS"] },
    },
    orderBy: [
      { recruitDate: "desc" },
      { resetSeq: "desc" },
      { updatedAt: "desc" },
    ],
    take: 2,
    include: { members: true },
  });

  return activeParties.length === 1 ? activeParties[0] : null;
}

function splitRecruitStatusBlocks(message: string) {
  const sections = message
    .replace(/\r/g, "\n")
    .split(/\n\s*-{10,}\s*\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const blocks: Array<{ recruitNo: number; message: string }> = [];
  const seen = new Set<number>();

  for (const section of sections) {
    const recruitNo = extractRecruitNoFromForm(section);
    if (!Number.isInteger(recruitNo) || recruitNo < 1 || recruitNo > 99)
      continue;
    if (seen.has(recruitNo)) continue;
    seen.add(recruitNo);
    blocks.push({ recruitNo, message: section });
  }

  return blocks;
}

function normalizeMemberSnapshot(
  members: Array<{
    name: string;
    position: string | null;
    slotNo: number | null;
    isSubstitute: boolean;
  }>,
) {
  return members
    .filter((member) => member.name.trim() !== "")
    .map((member) => ({
      name: member.name.trim(),
      position: member.position ?? null,
      slotNo: member.slotNo ?? null,
      isSubstitute: Boolean(member.isSubstitute),
    }))
    .sort((a, b) => {
      if (a.isSubstitute !== b.isSubstitute) return a.isSubstitute ? 1 : -1;
      if ((a.slotNo ?? 999) !== (b.slotNo ?? 999))
        return (a.slotNo ?? 999) - (b.slotNo ?? 999);
      return a.name.localeCompare(b.name, "ko");
    });
}

function sameNullableText(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return String(a || "").trim() === String(b || "").trim();
}

function hasRecruitPartyChanges(params: {
  party: Awaited<ReturnType<typeof findActiveRecruitParty>>;
  parsed: NonNullable<ReturnType<typeof parsePartyForm>>;
  isSoloRank: boolean;
}) {
  const { party, parsed, isSoloRank } = params;
  if (!party) return true;

  if (
    !sameNullableText(
      parsed.startTimeText ?? party.startTimeText,
      party.startTimeText,
    )
  )
    return true;
  if (!sameNullableText(parsed.note ?? party.note, party.note)) return true;

  if (isSoloRank) {
    if (!sameNullableText(parsed.tierText, party.tierText)) return true;
    if (!sameNullableText(parsed.preferredLineText, party.preferredLineText))
      return true;
    if (!sameNullableText(parsed.playStyle, party.playStyle)) return true;
  }

  const before = JSON.stringify(normalizeMemberSnapshot(party.members));
  const after = JSON.stringify(normalizeMemberSnapshot(parsed.members));
  return before !== after;
}

async function syncOneRecruit(params: {
  recruitNo: number;
  message: string;
  roomName: string | null;
  sender: string | null;
  recruitDate: string;
  todayRange: { gte: Date; lt: Date };
  operatorOverride: boolean;
}) {
  const {
    recruitNo,
    message,
    roomName,
    sender,
    recruitDate,
    todayRange,
    operatorOverride,
  } = params;

  const party = await findActiveRecruitParty({
    recruitNo,
  });

  if (!party) {
    const sameDateFinishedLog = await prisma.recruitPartyLog.findFirst({
      where: {
        recruitNo,
        recruitDate,
        action: { in: ["FINISHED", "AUTO_EXPIRED"] },
        createdAt: todayRange,
      },
      orderBy: [{ resetSeq: "desc" }, { createdAt: "desc" }],
      select: { title: true, memberCount: true, maxMembers: true },
    });

    const finishedLog =
      sameDateFinishedLog ??
      (await prisma.recruitPartyLog.findFirst({
        where: { recruitNo, action: { in: ["FINISHED", "AUTO_EXPIRED"] } },
        orderBy: [
          { recruitDate: "desc" },
          { resetSeq: "desc" },
          { createdAt: "desc" },
        ],
        select: { title: true, memberCount: true, maxMembers: true },
      }));

    return {
      ok: false,
      recruitNo,
      statusCode: 404,
      reply: finishedLog
        ? [
            "[K-LOL.GG 구인구직 반영 안내]",
            `모집번호 #${recruitNo}는 이미 마무리된 구인글입니다.`,
            `기록: ${finishedLog.title || "구인글"}`,
            `최종 인원: ${Math.min(finishedLog.memberCount, finishedLog.maxMembers)}/${finishedLog.maxMembers}`,
            "마무리된 번호에는 인원을 추가할 수 없습니다.",
          ].join("\n")
        : [
            "[K-LOL.GG 구인구직 반영 실패]",
            "",
            `모집번호 #${recruitNo} 파티를 찾지 못했습니다.`,
            "먼저 구인 생성 명령어로 오늘 파티를 생성해주세요.",
          ].join("\n"),
    };
  }

  const ownership = evaluatePartyMutationOwnership(await getKakaoOperationSettings(), {
    partyRoomName: party.roomName,
    partyHostName: party.hostName,
    roomName,
    sender,
    operatorOverride,
  });

  const parsed = parsePartyForm(message, String(party.type), party.maxMembers);
  if (!parsed) {
    return {
      ok: false,
      recruitNo,
      statusCode: 400,
      reply: `[K-LOL.GG 구인구직 반영 실패]\n모집번호 #${recruitNo}에서 반영 가능한 양식을 찾지 못했습니다.`,
    };
  }

  const tooLongMember = parsed.members.find((member) => isKakaoNameTooLong(member.name));
  if (tooLongMember) {
    return {
      ok: false,
      recruitNo,
      statusCode: 400,
      reply: `[K-LOL.GG 구인구직 반영 실패]\n이름은 ${MAX_KAKAO_NAME_LENGTH}자 이하로 입력해주세요.`,
    };
  }

  if (parsed.recruitNo !== recruitNo) {
    return {
      ok: false,
      recruitNo,
      statusCode: 400,
      reply: [
        "[K-LOL.GG 구인구직 반영 실패]",
        "",
        `요청 모집번호 #${recruitNo}와 양식 모집번호 #${parsed.recruitNo}가 다릅니다.`,
        "수정할 모집번호 한 개의 블록만 다시 보내주세요.",
      ].join("\n"),
    };
  }

  parsed.members = promotePartySubstitutesAfterRemoval({
    previousMembers: party.members,
    submittedMembers: parsed.members,
    partyType: String(party.type),
    maxMembers: party.maxMembers,
  });

  if (!isLinePartyType(String(party.type))) {
    const excessSlotNos = findNumberedSlotsAboveMaxMembers(
      message,
      party.maxMembers,
    );

    if (excessSlotNos.length > 0) {
      return {
        ok: false,
        recruitNo,
        statusCode: 400,
        reply: [
          "[K-LOL.GG 구인구직 반영 실패]",
          "",
          `모집번호 #${recruitNo}는 ${party.maxMembers}인 파티입니다.`,
          `${excessSlotNos.join(", ")}번 칸은 사용할 수 없습니다.`,
          "구인현황 전체가 아니라 해당 모집번호 블록만 보내주세요.",
        ].join("\n"),
      };
    }
  }

  const activeParsedMemberCount = parsed.members.filter(
    (member) => !member.isSubstitute && member.name.trim() !== "",
  ).length;

  if (activeParsedMemberCount > party.maxMembers) {
    return {
      ok: false,
      recruitNo,
      statusCode: 400,
      reply: [
        "[K-LOL.GG 구인구직 반영 실패]",
        "",
        `모집번호 #${recruitNo}는 최대 ${party.maxMembers}명까지 등록할 수 있습니다.`,
        `현재 입력 인원: ${activeParsedMemberCount}명`,
      ].join("\n"),
    };
  }

  const isSoloRank = isSoloRankPartyType(String(party.type));

  const nextStartTimeText = parsed.startTimeText ?? party.startTimeText;
  const startTimeChanged = !sameNullableText(nextStartTimeText, party.startTimeText);
  const parsedScheduledStartAt = parseRecruitScheduledStartAt(nextStartTimeText, new Date());
  const nextScheduledStartAt = startTimeChanged
    ? parsedScheduledStartAt
    : (party.scheduledStartAt ?? parsedScheduledStartAt);
  const shouldBackfillScheduledStartAt = Boolean(!party.scheduledStartAt && nextScheduledStartAt);

  if (party.status === "IN_PROGRESS" && !hasRecruitPartyChanges({ party, parsed, isSoloRank }) && !shouldBackfillScheduledStartAt) {
    return {
      ok: true,
      recruitNo,
      statusCode: 200,
      party,
      noChanged: true,
      reply: "[K-LOL.GG 구인구직 변경 없음]",
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await acquirePartyRecruitLock(tx, party.id);
    await tx.recruitPartyMember.deleteMany({ where: { partyId: party.id } });

    if (parsed.members.length > 0) {
      await tx.recruitPartyMember.createMany({
        data: parsed.members.map((member) => ({
          partyId: party.id,
          name: member.name,
          position: member.position,
          slotNo: member.slotNo,
          isSubstitute: member.isSubstitute,
        })),
        skipDuplicates: true,
      });
    }

    const result = await tx.recruitParty.update({
      where: { id: party.id },
      data: {
        status: "IN_PROGRESS",
        startTimeText: nextStartTimeText,
        scheduledStartAt: nextScheduledStartAt,
        tierText: isSoloRank ? parsed.tierText : null,
        preferredLineText: isSoloRank ? parsed.preferredLineText : null,
        playStyle: isSoloRank ? parsed.playStyle : null,
        note: parsed.note ?? party.note,
        roomName: roomName ?? party.roomName,
      },
      include: {
        members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
      },
    });

    await writeAdminLog({
      action: "KAKAO_PARTY_RECRUIT_SYNC",
      message: `카카오 구인구직 파티 반영: #${result.recruitNo} ${result.title}, ${Math.min(result.members.filter((member) => !member.isSubstitute && member.name.trim() !== "").length, result.maxMembers)}/${result.maxMembers}`,
      targetType: "RecruitParty",
      targetId: result.id,
      afterJson: {
        recruitNo: result.recruitNo,
        recruitDate: result.recruitDate,
        resetSeq: result.resetSeq,
        roomName,
        sender,
        operatorOverride: ownership.operatorOverride,
        scheduledStartAt: result.scheduledStartAt?.toISOString() ?? null,
        members: result.members,
      },
      db: tx,
    });

    return result;
  });

  return {
    ok: true,
    recruitNo,
    statusCode: 200,
    party: updated,
    reply: buildSyncReply(updated),
  };
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);
    if (secretRejected) return secretRejected;
    const policyRejected = await rejectPartyPolicy(body, "RECRUIT_JOIN", { requireIdentity: true });
    if (policyRejected) return policyRejected;

    await expirePartyRecruitDrafts();

    const rawMessage = getBodyText(body);
    const messageError = getKakaoMessageValidationError(rawMessage);
    if (messageError) {
      return partyRecruitJson({ reply: `[K-LOL.GG 파티 명단 반영 실패]\n${messageError}` }, 400);
    }
    const message = stripAppendedRecruitStatusSummary(rawMessage);
    const classification = classifyKakaoRecruitMessage(message);

    // Some legacy Kakao bot rules route every form containing "#번호" to the
    // party sync endpoint. A clearly identified inhouse snapshot is safe to
    // hand to the canonical season endpoint; that endpoint performs its own
    // validation, operation-date checks, locking, and idempotent diff update.
    if (classification.kind === "SEASON_RECRUIT") {
      const headers = new Headers(req.headers);
      headers.set("content-type", "application/json");
      headers.delete("content-length");

      const forwardedRequest = new NextRequest(
        new URL("/api/kakao/recruit/season-apply", req.url),
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ...body, message }),
        },
      );

      return applySeasonRecruit(forwardedRequest);
    }

    if (classification.kind !== "PARTY_RECRUIT") {
      return partyRecruitJson(
        { reply: buildWrongRecruitApiReply({ expected: "파티구인", actual: classification.kind }) },
        400,
      );
    }

    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const recruitDate = getKakaoRecruitDateKey();
    const todayRange = getKakaoRecruitTodayRange();
    const recruitNos = extractRecruitNosFromForm(message);
    const statusBlocks = splitRecruitStatusBlocks(message);

    if (recruitNos.length > 1 || statusBlocks.length > 1) {
      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 반영 실패]",
            "",
            "하나의 메시지에서 모집번호가 여러 개 발견되었습니다.",
            "구인현황 전체 복사본은 반영하지 않습니다.",
            "수정할 모집번호 한 개의 블록만 복사해서 붙여넣어주세요.",
          ].join("\n"),
        },
        400,
      );
    }

    const recruitNo = extractRecruitNoFromForm(message);
    if (!Number.isInteger(recruitNo) || recruitNo < 1 || recruitNo > 99) {
      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 반영 실패]",
            "",
            "모집번호를 찾지 못했습니다.",
            "모집번호가 없는 구인글은 반영하지 않습니다.",
            "",
            "예시",
            "모집번호: #12",
            "1. 재현",
          ].join("\n"),
        },
        400,
      );
    }

    const result = await syncOneRecruit({
      recruitNo,
      message,
      roomName,
      sender,
      recruitDate,
      todayRange,
      operatorOverride: body.operatorOverride === true,
    });

    return partyRecruitJson(
      {
        party: result.ok ? result.party : undefined,
        reply: result.ok
          ? await appendRecruitStatusSummary(result.reply)
          : result.reply,
      },
      result.statusCode,
    );
  } catch (error) {
    logServerError("[KAKAO_PARTY_RECRUIT_SYNC_ERROR]", error);
    return partyRecruitJson(
      {
        reply: "[K-LOL.GG 구인구직 반영 실패]\n잠시 후 다시 시도해주세요.",
      },
      500,
    );
  }
}
