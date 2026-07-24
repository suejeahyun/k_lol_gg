import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import {
  buildScrimFormFromData,
  buildScrimRecruitTemplate,
  countScrimLineupValues,
  getScrimRecruitDateKey,
  getScrimStatusLabel,
  hasScrimLineupValue,
  isValidScrimTeamName,
  parseScrimCreateCommand,
  type ScrimLineup,
} from "@/lib/kakao/destruction-scrim-recruit";
import {
  classifyKakaoRecruitMessage,
  buildWrongRecruitApiReply,
} from "@/lib/kakao/recruit-message-kind";
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

const ACTIVE_SCRIM_STATUSES: DestructionScrimRecruitStatus[] = [
  "RECRUITING",
  "MATCHED",
  "CONFIRMED",
];

const CREATE_HELP = [
  "[K-LOL.GG 스크림구인 등록 실패]",
  "",
  "명령어 형식이 올바르지 않습니다.",
  "",
  "양식 호출: /스크림구인",
].join("\n");

function lineupJson(
  lineup: ScrimLineup,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!hasScrimLineupValue(lineup)) return Prisma.JsonNull;
  return lineup as unknown as Prisma.InputJsonObject;
}

function normalizeName(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeLaneValue(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isScrimCreateSystemEcho(message: string) {
  const text = String(message || "")
    .replace(/\s+/g, "")
    .trim();
  return (
    /스크림구인양식불러오는중/.test(text) ||
    /스크림구인양식불러오는중[.…]*/.test(text) ||
    /스크림현황불러오는중/.test(text) ||
    /scrim_system_echo_message/.test(text) ||
    /"reason":"scrim_system_echo_message"/.test(text) ||
    /\[스크림구인서버응답확인필요\]/.test(text) ||
    /\[스크림구인API오류\]/.test(text)
  );
}

type ExplicitLineupPatch = Record<
  keyof ScrimLineup,
  { present: boolean; value: string | null }
>;

function cleanExplicitLaneValue(value: string | null | undefined) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (
    /^(미정|없음|상대구함|상대 구함|모집중|비워두기|공란|빈칸|삭제|제거|빼기|빼주세요|-)$/.test(
      text,
    )
  )
    return null;
  return text;
}

function emptyExplicitLineupPatch(): ExplicitLineupPatch {
  return {
    top: { present: false, value: null },
    jungle: { present: false, value: null },
    mid: { present: false, value: null },
    adc: { present: false, value: null },
    support: { present: false, value: null },
  };
}

function extractOpponentSectionFromMessage(message: string) {
  const lines = String(message || "")
    .replace(/\r/g, "\n")
    .split("\n");
  const out: string[] = [];
  let active = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!active && /^상대팀(?:명|\s*라인업|\s*명단)?\s*[:：]/i.test(trimmed)) {
      active = true;
      out.push(line);
      continue;
    }
    if (
      active &&
      /^(우리팀|아군팀|요청팀|일시|방식|메모|비고|요청사항)\s*[:：]/i.test(
        trimmed,
      )
    )
      break;
    if (active) out.push(line);
  }

  return out.join("\n");
}

function readExplicitOpponentLineupPatch(message: string): ExplicitLineupPatch {
  const section = extractOpponentSectionFromMessage(message);
  const patch = emptyExplicitLineupPatch();
  if (!section) return patch;

  const laneMap: Array<[keyof ScrimLineup, string[]]> = [
    ["top", ["TOP", "TOPLANE", "TOP LANE", "탑"]],
    ["jungle", ["JUG", "JGL", "JG", "JUNGLE", "정글"]],
    ["mid", ["MID", "MIDDLE", "미드"]],
    ["adc", ["ADC", "AD", "BOT", "BOTTOM", "원딜"]],
    ["support", ["SUP", "SUPPORT", "서폿", "서포터"]],
  ];

  const lines = section.split("\n");
  for (const line of lines) {
    for (const [key, labels] of laneMap) {
      const escaped = labels
        .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
      const re = new RegExp(`^\\s*(?:${escaped})\\s*[.:：]\\s*(.*)\\s*$`, "i");
      const match = line.match(re);
      if (match) {
        patch[key] = { present: true, value: cleanExplicitLaneValue(match[1]) };
      }
    }
  }

  return patch;
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

function mergeLineup(
  existing: ScrimLineup,
  incoming: ScrimLineup,
  explicitPatch?: ExplicitLineupPatch,
) {
  const merged: ScrimLineup = { ...existing };
  const changed: string[] = [];
  const lanes: Array<[keyof ScrimLineup, string]> = [
    ["top", "TOP"],
    ["jungle", "JUG"],
    ["mid", "MID"],
    ["adc", "ADC"],
    ["support", "SUP"],
  ];

  const hasAnyIncomingValue = hasScrimLineupValue(incoming);

  for (const [key, label] of lanes) {
    const current = normalizeLaneValue(existing[key]);
    const explicit = explicitPatch?.[key];
    const explicitValue = normalizeLaneValue(explicit?.value);
    const next = explicit?.present
      ? explicitValue
      : normalizeLaneValue(incoming[key]);

    if (explicit?.present && !explicitValue) {
      // 전체 상대팀 공란 양식을 다시 올린 경우에는 기존 라인을 전부 지우지 않는다.
      // 단, 상대팀 입력 중 일부를 수정하면서 특정 라인만 비우거나 "삭제"라고 쓴 경우에는 제거로 처리한다.
      const shouldClear = hasAnyIncomingValue;
      if (shouldClear && current) {
        merged[key] = null;
        changed.push(label);
      }
      continue;
    }

    if (!next) continue;

    if (!current || normalizeName(current) !== normalizeName(next)) {
      merged[key] = next;
      changed.push(label);
    }
  }

  return { merged, changed, conflicts: [] as string[] };
}

function hasLineupOrName(params: {
  teamName?: string | null;
  lineup: ScrimLineup;
}) {
  return Boolean(params.teamName || hasScrimLineupValue(params.lineup));
}

function hasRequesterCreateData(
  parsed: NonNullable<ReturnType<typeof parseScrimCreateCommand>>,
) {
  return Boolean(
    isValidScrimTeamName(parsed.requesterTeamName) &&
    countScrimLineupValues(parsed.requesterLineup) > 0,
  );
}

function validateNewScrimForm(
  parsed: NonNullable<ReturnType<typeof parseScrimCreateCommand>>,
) {
  const errors: string[] = [];

  if (!isValidScrimTeamName(parsed.requesterTeamName))
    errors.push("우리팀 이름을 입력해주세요.");
  if (!parsed.startTimeText) errors.push("일시를 입력해주세요.");
  if (!parsed.seriesRuleText && !parsed.gameCount)
    errors.push("방식을 입력해주세요.");
  if (countScrimLineupValues(parsed.requesterLineup) === 0)
    errors.push("우리팀 라인별 정보를 1명 이상 입력해주세요.");

  return errors;
}

async function findSameDateScrimByNoAnyStatus(
  scrimNo: number,
  recruitDate = getScrimRecruitDateKey(),
) {
  return prisma.destructionScrimRecruit.findFirst({
    where: { scrimNo, recruitDate },
    orderBy: [{ updatedAt: "desc" }],
  });
}

async function isScrimNoAlreadyUsed(scrimNo: number) {
  const existing = await prisma.destructionScrimRecruit.findFirst({
    where: { scrimNo, recruitDate: getScrimRecruitDateKey() },
    select: { id: true },
  });

  return Boolean(existing);
}

async function resolveCreateScrimNo(parsedScrimNo: number | null) {
  if (!parsedScrimNo) return getNextScrimNo();

  // 같은 운영일에 이미 사용된 번호는 상세 명령과 충돌하므로 재사용하지 않습니다.
  // 단, 활성 스크림 수정/상대 등록은 위쪽 findActiveScrim 분기에서 먼저 처리됩니다.
  if (await isScrimNoAlreadyUsed(parsedScrimNo)) return getNextScrimNo();

  return parsedScrimNo;
}

async function findSameRequesterScrim(params: {
  tournamentId: number;
  requesterTeamName: string | null;
  requesterLineup: ScrimLineup;
  startTimeText: string | null;
  seriesRuleText: string | null;
}) {
  if (
    !params.requesterTeamName ||
    !params.startTimeText ||
    !params.seriesRuleText ||
    !hasScrimLineupValue(params.requesterLineup)
  ) {
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

  return (
    candidates.find((scrim) =>
      sameLineup(readLineup(scrim.requesterLineupJson), params.requesterLineup),
    ) ?? null
  );
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
  const explicitPatch = readExplicitOpponentLineupPatch(params.message);
  const merge = mergeLineup(
    currentOpponent,
    params.parsed.opponentLineup,
    explicitPatch,
  );
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
      ...(params.parsed.opponentTeamName
        ? {
            opponentTeamName:
              opponentTeam?.name ?? params.parsed.opponentTeamName,
          }
        : {}),
      ...(opponentTeam
        ? { opponentTeam: { connect: { id: opponentTeam.id } } }
        : {}),
      ...(scrim.status === "RECRUITING" &&
      hasLineupOrName({
        teamName: params.parsed.opponentTeamName,
        lineup: merge.merged,
      })
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
    afterJson: {
      scrimNo: updated.scrimNo,
      changed: merge.changed,
      roomName: params.roomName,
      sender: params.sender,
    },
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
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    const body = await readJsonBody(req);
    const rejected = rejectIfInvalidScrimSecret(req, body.secret);
    if (rejected) return rejected;

    const message = getBodyText(body);

    if (isScrimCreateSystemEcho(message)) {
      return scrimRecruitJson({
        reply: "",
        ignored: true,
        reason: "scrim_system_echo_message",
      });
    }

    const parsed = parseScrimCreateCommand(message);

    if (parsed?.isTemplateRequest) {
      const scrimNo = parsed.scrimNo ?? (await getNextScrimNo());
      return scrimRecruitJson({
        reply: buildScrimRecruitTemplate(scrimNo),
        templateOnly: true,
        scrimNo,
      });
    }

    const classification = classifyKakaoRecruitMessage(message);
    if (classification.kind !== "SCRIM_RECRUIT") {
      return scrimRecruitJson(
        {
          reply: buildWrongRecruitApiReply({
            expected: "스크림구인",
            actual: classification.kind,
          }),
        },
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
        const result = await applyOpponentLineupToExisting({
          scrim,
          parsed,
          roomName,
          sender,
          message,
        });
        if (result) return result;
      } else {
        const inactiveScrim = await findSameDateScrimByNoAnyStatus(
          parsed.scrimNo,
        );
        if (inactiveScrim) {
          return scrimRecruitJson(
            {
              reply: [
                "[K-LOL.GG 스크림구인 수정 실패]",
                `스크림 #${parsed.scrimNo}은 현재 ${getScrimStatusLabel(inactiveScrim.status)} 상태입니다.`,
                "종료/취소된 스크림은 수정할 수 없습니다.",
              ].join("\n"),
            },
            409,
          );
        }

        if (!hasRequesterCreateData(parsed)) {
          return scrimRecruitJson(
            {
              reply: [
                "[K-LOL.GG 스크림구인 수정 실패]",
                `스크림 #${parsed.scrimNo}을 찾지 못했습니다.`,
                "먼저 /스크림구인 양식의 우리팀 정보를 채워 등록해주세요.",
              ].join("\n"),
            },
            404,
          );
        }
      }
    }

    const createValidationErrors = validateNewScrimForm(parsed);
    if (createValidationErrors.length > 0) {
      return scrimRecruitJson(
        {
          reply: [
            "[K-LOL.GG 스크림구인 등록 실패]",
            "",
            ...createValidationErrors,
            "",
            "등록 순서: /스크림구인 → 번호가 포함된 양식 작성 → 상대팀이 같은 번호 양식에 입력",
          ].join("\n"),
        },
        400,
      );
    }

    const tournament = await findTargetTournament(parsed.tournamentId);
    if (!tournament) {
      return scrimRecruitJson(
        {
          reply:
            "[K-LOL.GG 스크림구인 등록 실패]\n진행 중인 멸망전을 찾지 못했습니다.",
        },
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
      const result = await applyOpponentLineupToExisting({
        scrim: existingByIdentity,
        parsed,
        roomName,
        sender,
        message,
      });
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

    const requesterTeam = await findTeamByName(
      tournament.id,
      parsed.requesterTeamName,
    );
    const opponentTeam = await findTeamByName(
      tournament.id,
      parsed.opponentTeamName,
    );
    const scrimNo = await resolveCreateScrimNo(parsed.scrimNo);
    const title = `${requesterTeam?.name || parsed.requesterTeamName || "요청팀"} 스크림 구인`;
    const initialStatus = hasLineupOrName({
      teamName: parsed.opponentTeamName,
      lineup: parsed.opponentLineup,
    })
      ? "MATCHED"
      : "RECRUITING";

    const scrim = await prisma.destructionScrimRecruit.create({
      data: {
        scrimNo,
        recruitDate: getScrimRecruitDateKey(),
        tournament: { connect: { id: tournament.id } },
        ...(requesterTeam
          ? { requesterTeam: { connect: { id: requesterTeam.id } } }
          : {}),
        ...(opponentTeam
          ? { opponentTeam: { connect: { id: opponentTeam.id } } }
          : {}),
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
      afterJson: {
        scrimNo: scrim.scrimNo,
        tournamentId: scrim.tournamentId,
        roomName,
        sender,
      },
    });

    return scrimRecruitJson({
      scrim,
      reply: "[K-LOL.GG 스크림 등록 완료]",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson(
      { reply: `[K-LOL.GG 스크림구인 등록 실패]\n${message}`, error: message },
      500,
    );
  }
}
