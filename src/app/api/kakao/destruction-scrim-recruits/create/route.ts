export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import {
  buildScrimFormFromData,
  buildScrimRecruitTemplate,
  countScrimLineupValues,
  getScrimStatusLabel,
  hasScrimLineupValue,
  isValidScrimTeamName,
  parseScrimCreateCommand,
  type ScrimLineup,
} from "@/lib/kakao/destruction-scrim-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import { DestructionScrimRecruitStatus, Prisma } from "@prisma/client";
import {
  findActiveScrim,
  findTargetTournament,
  findTeamByName,
  getBodyRoom,
  getBodySender,
  getBodyText,
  getMessageHash,
  getNextScrimNo,
  readJsonBody,
  rejectIfInvalidScrimSecret,
  scrimRecruitJson,
} from "../_shared";
import { prisma } from "@/lib/prisma/client";

const ACTIVE_SCRIM_STATUSES: DestructionScrimRecruitStatus[] = ["RECRUITING", "MATCHED", "CONFIRMED"];

const CREATE_HELP = [
  "[K-LOL.GG 스크림구인 등록 실패]",
  "",
  "명령어 형식이 올바르지 않습니다.",
  "",
  "양식 호출: /스크림구인",
].join("\n");

function kstDateKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function lineupJson(lineup: ScrimLineup): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!hasScrimLineupValue(lineup)) return Prisma.JsonNull;
  return lineup as unknown as Prisma.InputJsonObject;
}

function normalizeName(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function normalizeLaneValue(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function readLineup(value: unknown): ScrimLineup {
  if (!value || typeof value !== "object") {
    return { top: null, jungle: null, mid: null, adc: null, support: null };
  }

  const record = value as Record<string, unknown>;
  return {
    top: typeof record.top === "string" ? record.top : null,
    jungle: typeof record.jungle === "string" ? record.jungle : null,
    mid: typeof record.mid === "string" ? record.mid : null,
    adc: typeof record.adc === "string" ? record.adc : null,
    support: typeof record.support === "string" ? record.support : null,
  };
}

function sameLineup(a: ScrimLineup, b: ScrimLineup) {
  return (
    normalizeName(a.top) === normalizeName(b.top) &&
    normalizeName(a.jungle) === normalizeName(b.jungle) &&
    normalizeName(a.mid) === normalizeName(b.mid) &&
    normalizeName(a.adc) === normalizeName(b.adc) &&
    normalizeName(a.support) === normalizeName(b.support)
  );
}

function mergeLineup(existing: ScrimLineup, incoming: ScrimLineup) {
  const merged: ScrimLineup = { ...existing };
  const changed: string[] = [];
  const conflicts: string[] = [];
  const lanes: Array<[keyof ScrimLineup, string]> = [
    ["top", "TOP"],
    ["jungle", "JUG"],
    ["mid", "MID"],
    ["adc", "ADC"],
    ["support", "SUP"],
  ];

  for (const [key, label] of lanes) {
    const current = normalizeLaneValue(existing[key]);
    const next = normalizeLaneValue(incoming[key]);
    if (!next) continue;

    if (!current) {
      merged[key] = next;
      changed.push(label);
      continue;
    }

    if (normalizeName(current) !== normalizeName(next)) {
      conflicts.push(`${label}: 이미 ${current} 등록됨`);
    }
  }

  return { merged, changed, conflicts };
}

function hasLineupOrName(params: { teamName?: string | null; lineup: ScrimLineup }) {
  return Boolean(params.teamName || hasScrimLineupValue(params.lineup));
}

function hasRequesterCreateData(parsed: NonNullable<ReturnType<typeof parseScrimCreateCommand>>) {
  return Boolean(isValidScrimTeamName(parsed.requesterTeamName) && countScrimLineupValues(parsed.requesterLineup) > 0);
}

function validateNewScrimForm(parsed: NonNullable<ReturnType<typeof parseScrimCreateCommand>>) {
  const errors: string[] = [];

  if (!isValidScrimTeamName(parsed.requesterTeamName)) errors.push("우리팀 이름을 입력해주세요.");
  if (!parsed.startTimeText) errors.push("일시를 입력해주세요.");
  if (!parsed.seriesRuleText && !parsed.gameCount) errors.push("방식을 입력해주세요.");
  if (countScrimLineupValues(parsed.requesterLineup) === 0) errors.push("우리팀 라인별 정보를 1명 이상 입력해주세요.");

  return errors;
}

async function findSameDateScrimByNoAnyStatus(scrimNo: number, recruitDate = kstDateKey()) {
  return prisma.destructionScrimRecruit.findFirst({
    where: { scrimNo, recruitDate },
    orderBy: [{ updatedAt: "desc" }],
  });
}

async function findSameRequesterScrim(params: {
  tournamentId: number;
  requesterTeamName: string | null;
  requesterLineup: ScrimLineup;
  startTimeText: string | null;
  seriesRuleText: string | null;
}) {
  if (!params.requesterTeamName || !params.startTimeText || !params.seriesRuleText || !hasScrimLineupValue(params.requesterLineup)) {
    return null;
  }

  const candidates = await prisma.destructionScrimRecruit.findMany({
    where: {
      tournamentId: params.tournamentId,
      status: { in: ACTIVE_SCRIM_STATUSES },
      requesterTeamName: {
        equals: params.requesterTeamName,
        mode: "insensitive",
      },
      startTimeText: params.startTimeText,
      seriesRuleText: params.seriesRuleText,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 10,
  });

  return candidates.find((scrim) => sameLineup(readLineup(scrim.requesterLineupJson), params.requesterLineup)) ?? null;
}

async function applyOpponentLineupToExisting(params: {
  scrim: Awaited<ReturnType<typeof findActiveScrim>>;
  parsed: NonNullable<ReturnType<typeof parseScrimCreateCommand>>;
  roomName: string | null;
  sender: string | null;
  message: string;
}) {
  const scrim = params.scrim;
  if (!scrim) return null;

  const currentOpponent = readLineup(scrim.opponentLineupJson);
  const merge = mergeLineup(currentOpponent, params.parsed.opponentLineup);
  if (merge.conflicts.length > 0) {
    return scrimRecruitJson(
      {
        reply: [
          "[K-LOL.GG 스크림 상대 등록 실패]",
          "",
          `스크림 #${scrim.scrimNo}`,
          ...merge.conflicts,
          "",
          "비어 있는 라인에만 이름을 추가할 수 있습니다.",
        ].join("\n"),
      },
      409,
    );
  }

  if (merge.changed.length === 0 && !params.parsed.opponentTeamName) {
    return scrimRecruitJson({
      scrim,
      reply: [
        "[K-LOL.GG 스크림 중복 등록 차단]",
        "",
        `이미 등록된 스크림입니다. 번호: #${scrim.scrimNo}`,
        "상대팀 빈 라인에 이름을 넣으면 기존 스크림에 반영됩니다.",
        "",
        buildScrimFormFromData(scrim),
      ].join("\n"),
    });
  }

  const opponentTeam = params.parsed.opponentTeamName
    ? await findTeamByName(scrim.tournamentId, params.parsed.opponentTeamName)
    : null;

  const updated = await prisma.destructionScrimRecruit.update({
    where: { id: scrim.id },
    data: {
      opponentLineupJson: lineupJson(merge.merged),
      ...(params.parsed.opponentTeamName ? { opponentTeamName: opponentTeam?.name ?? params.parsed.opponentTeamName } : {}),
      ...(opponentTeam ? { opponentTeam: { connect: { id: opponentTeam.id } } } : {}),
      ...(scrim.status === "RECRUITING" && hasLineupOrName({ teamName: params.parsed.opponentTeamName, lineup: merge.merged })
        ? { status: "MATCHED" as DestructionScrimRecruitStatus }
        : {}),
      roomName: params.roomName ?? scrim.roomName,
    },
  });

  await prisma.destructionScrimRecruitLog.create({
    data: {
      scrimNo: updated.scrimNo,
      recruitDate: updated.recruitDate,
      tournamentId: updated.tournamentId,
      action: "FORM_LINE_JOIN",
      title: updated.title,
      summary: params.message,
      roomName: params.roomName,
      sender: params.sender,
    },
  });

  await writeAdminLog({
    action: "KAKAO_DESTRUCTION_SCRIM_LINE_JOIN",
    message: `카카오 스크림 상대 라인 반영: #${updated.scrimNo} ${merge.changed.join(",")}`,
    targetType: "DestructionScrimRecruit",
    targetId: updated.id,
    afterJson: { scrimNo: updated.scrimNo, changed: merge.changed, roomName: params.roomName, sender: params.sender },
  });

  return scrimRecruitJson({
    scrim: updated,
    reply: [
      "[K-LOL.GG 스크림 상대 등록 완료]",
      "",
      `번호: #${updated.scrimNo}`,
      `반영 라인: ${merge.changed.length > 0 ? merge.changed.join(", ") : "변경 없음"}`,
      `상태: ${getScrimStatusLabel(updated.status)}`,
      "",
      buildScrimFormFromData(updated),
    ].join("\n"),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const rejected = rejectIfInvalidScrimSecret(req, body.secret);
    if (rejected) return rejected;

    const message = getBodyText(body);
    const parsed = parseScrimCreateCommand(message);

    if (parsed?.isTemplateRequest) {
      const scrimNo = parsed.scrimNo ?? await getNextScrimNo();
      return scrimRecruitJson({ reply: buildScrimRecruitTemplate(scrimNo), templateOnly: true, scrimNo });
    }

    const classification = classifyKakaoRecruitMessage(message);
    if (classification.kind !== "SCRIM_RECRUIT") {
      return scrimRecruitJson(
        { reply: buildWrongRecruitApiReply({ expected: "스크림구인", actual: classification.kind }) },
        400,
      );
    }

    if (!parsed) return scrimRecruitJson({ reply: CREATE_HELP }, 400);

    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const sourceMessageHash = getMessageHash(message);

    if (parsed.scrimNo) {
      const scrim = await findActiveScrim(parsed.scrimNo);
      if (scrim) {
        const result = await applyOpponentLineupToExisting({ scrim, parsed, roomName, sender, message });
        if (result) return result;
      } else {
        const inactiveScrim = await findSameDateScrimByNoAnyStatus(parsed.scrimNo);
        if (inactiveScrim) {
          return scrimRecruitJson({
            reply: [
              "[K-LOL.GG 스크림구인 수정 실패]",
              `스크림 #${parsed.scrimNo}은 현재 ${getScrimStatusLabel(inactiveScrim.status)} 상태입니다.`,
              "종료/취소된 스크림은 수정할 수 없습니다.",
            ].join("\n"),
          }, 409);
        }

        if (!hasRequesterCreateData(parsed)) {
          return scrimRecruitJson({
            reply: [
              "[K-LOL.GG 스크림구인 수정 실패]",
              `스크림 #${parsed.scrimNo}을 찾지 못했습니다.`,
              "먼저 /스크림구인 양식의 우리팀 정보를 채워 등록해주세요.",
            ].join("\n"),
          }, 404);
        }
      }
    }

    const createValidationErrors = validateNewScrimForm(parsed);
    if (createValidationErrors.length > 0) {
      return scrimRecruitJson({
        reply: [
          "[K-LOL.GG 스크림구인 등록 실패]",
          "",
          ...createValidationErrors,
          "",
          "등록 순서: /스크림구인 → 번호가 포함된 양식 작성 → 상대팀이 같은 번호 양식에 입력",
        ].join("\n"),
      }, 400);
    }

    const tournament = await findTargetTournament(parsed.tournamentId);
    if (!tournament) {
      return scrimRecruitJson(
        { reply: "[K-LOL.GG 스크림구인 등록 실패]\n진행 중인 멸망전을 찾지 못했습니다." },
        404,
      );
    }

    const existingByIdentity = await findSameRequesterScrim({
      tournamentId: tournament.id,
      requesterTeamName: parsed.requesterTeamName,
      requesterLineup: parsed.requesterLineup,
      startTimeText: parsed.startTimeText,
      seriesRuleText: parsed.seriesRuleText,
    });

    if (existingByIdentity) {
      const result = await applyOpponentLineupToExisting({ scrim: existingByIdentity, parsed, roomName, sender, message });
      if (result) return result;
    }

    const existingByHash = await prisma.destructionScrimRecruit.findFirst({
      where: { sourceMessageHash },
    });

    if (existingByHash) {
      return scrimRecruitJson({
        scrim: existingByHash,
        reply: [
          "[K-LOL.GG 스크림구인 중복 등록 차단]",
          "",
          `이미 등록된 스크림입니다. 번호: #${existingByHash.scrimNo}`,
          "같은 카카오톡 메시지는 다시 저장하지 않습니다.",
          "",
          buildScrimFormFromData(existingByHash),
        ].join("\n"),
      });
    }

    const requesterTeam = await findTeamByName(tournament.id, parsed.requesterTeamName);
    const opponentTeam = await findTeamByName(tournament.id, parsed.opponentTeamName);
    const scrimNo = parsed.scrimNo ?? await getNextScrimNo();
    const title = `${requesterTeam?.name || parsed.requesterTeamName || "요청팀"} 스크림 구인`;
    const initialStatus = hasLineupOrName({ teamName: parsed.opponentTeamName, lineup: parsed.opponentLineup })
      ? "MATCHED"
      : "RECRUITING";

    const scrim = await prisma.destructionScrimRecruit.create({
      data: {
        scrimNo,
        recruitDate: kstDateKey(),
        tournament: { connect: { id: tournament.id } },
        ...(requesterTeam ? { requesterTeam: { connect: { id: requesterTeam.id } } } : {}),
        ...(opponentTeam ? { opponentTeam: { connect: { id: opponentTeam.id } } } : {}),
        requesterTeamName: requesterTeam?.name ?? parsed.requesterTeamName,
        opponentTeamName: opponentTeam?.name ?? parsed.opponentTeamName,
        requesterLineupJson: lineupJson(parsed.requesterLineup),
        opponentLineupJson: lineupJson(parsed.opponentLineup),
        title,
        scheduledAt: parsed.scheduledAt,
        startTimeText: parsed.startTimeText,
        gameCount: parsed.gameCount,
        seriesRuleText: parsed.seriesRuleText,
        memo: null,
        status: initialStatus,
        roomName,
        sender,
        sourceMessage: message,
        sourceMessageHash,
      },
    });

    await prisma.destructionScrimRecruitLog.create({
      data: {
        scrimNo: scrim.scrimNo,
        recruitDate: scrim.recruitDate,
        tournamentId: scrim.tournamentId,
        action: "CREATE",
        title: scrim.title,
        summary: message,
        roomName,
        sender,
      },
    });

    await writeAdminLog({
      action: "KAKAO_DESTRUCTION_SCRIM_CREATE",
      message: `카카오 스크림 생성: #${scrim.scrimNo} ${scrim.title}`,
      targetType: "DestructionScrimRecruit",
      targetId: scrim.id,
      afterJson: { scrimNo: scrim.scrimNo, tournamentId: scrim.tournamentId, roomName, sender },
    });

    return scrimRecruitJson({
      scrim,
      reply: [
        "[K-LOL.GG 스크림 등록 완료]",
        "",
        `번호: #${scrim.scrimNo}`,
        `우리팀: ${scrim.requesterTeamName || "미정"}`,
        `상대팀: ${scrim.opponentTeamName || "상대구함"}`,
        `일시: ${scrim.startTimeText || "미정"}`,
        `방식: ${scrim.seriesRuleText || (scrim.gameCount ? `${scrim.gameCount}판` : "미정")}`,
        `상태: ${getScrimStatusLabel(scrim.status)}`,
        "",
        buildScrimFormFromData(scrim),
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson({ reply: `[K-LOL.GG 스크림구인 등록 실패]\n${message}`, error: message }, 500);
  }
}
