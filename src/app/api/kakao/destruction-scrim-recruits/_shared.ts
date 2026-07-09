import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { DestructionScrimRecruitStatus, DestructionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import {
  buildScrimStatusReply,
  buildScrimFormFromData,
  formatScrimLine,
  getScrimRecruitDateKey,
} from "@/lib/kakao/destruction-scrim-recruit";

export async function readJsonBody(req: NextRequest) {
  return req.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

export function scrimRecruitJson(
  body: Record<string, unknown> & { reply: string },
  statusCode = 200,
) {
  return kakaoJsonReply(
    {
      formatVersion: "destruction-scrim-recruit-v1",
      ...body,
    },
    statusCode,
  );
}

export function rejectIfInvalidScrimSecret(req: NextRequest, bodySecret: unknown) {
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");
  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (headerSecret === secret || bearer === secret || querySecret === secret || secretText === secret) {
    return null;
  }

  return scrimRecruitJson({ reply: "[K-LOL.GG 스크림구인 실패]\n인증값이 올바르지 않습니다." }, 401);
}

export function getBodyText(body: Record<string, unknown>) {
  const userRequest = body.userRequest as { utterance?: unknown } | undefined;
  return String(body.message || body.text || body.utterance || userRequest?.utterance || "");
}

export function getBodyRoom(body: Record<string, unknown>) {
  if (typeof body.roomName === "string") return body.roomName;
  if (typeof body.room === "string") return body.room;
  return null;
}

export function getBodySender(body: Record<string, unknown>) {
  return typeof body.sender === "string" ? body.sender : null;
}

export function getMessageHash(message: string) {
  return createHash("sha256").update(String(message || "")).digest("hex");
}

export async function findTargetTournament(tournamentId?: number | null) {
  if (tournamentId) {
    return prisma.destructionTournament.findUnique({ where: { id: tournamentId } });
  }

  const activeTournamentStatuses: DestructionStatus[] = [
    "PLANNED",
    "RECRUITING",
    "TEAM_BUILDING",
    "AUCTION",
    "PRELIMINARY",
    "TOURNAMENT",
  ];

  return prisma.destructionTournament.findFirst({
    where: {
      status: { in: activeTournamentStatuses },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });
}

export async function findTeamByName(tournamentId: number, teamName?: string | null) {
  const name = String(teamName || "").trim();
  if (!name) return null;

  return prisma.destructionTeam.findFirst({
    where: {
      tournamentId,
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    select: { id: true, name: true },
  });
}

export async function getNextScrimNo(_recruitDate = getScrimRecruitDateKey()) {
  // 스크림 번호는 카카오톡 명령어에서 날짜 없이 사용됩니다.
  // 날짜별로 #1을 재사용하면 `스크림상세 1`이 과거 완료 건을 잡을 수 있으므로
  // 완료/취소 여부와 관계없이 전체 스크림 중 가장 큰 번호 다음 번호를 발급합니다.
  const latest = await prisma.destructionScrimRecruit.findFirst({
    orderBy: [{ scrimNo: "desc" }, { id: "desc" }],
    select: { scrimNo: true },
  });

  return (latest?.scrimNo ?? 0) + 1;
}

const ACTIVE_SCRIM_STATUSES: DestructionScrimRecruitStatus[] = [
  "RECRUITING",
  "MATCHED",
  "CONFIRMED",
];

export async function findActiveScrim(scrimNo: number, recruitDate = getScrimRecruitDateKey()) {
  const sameDate = await prisma.destructionScrimRecruit.findFirst({
    where: {
      scrimNo,
      recruitDate,
      status: { in: ACTIVE_SCRIM_STATUSES },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (sameDate) return sameDate;

  return prisma.destructionScrimRecruit.findFirst({
    where: {
      scrimNo,
      status: { in: ACTIVE_SCRIM_STATUSES },
    },
    orderBy: [{ recruitDate: "desc" }, { updatedAt: "desc" }],
  });
}

async function findScrimForDetail(scrimNo: number, recruitDate = getScrimRecruitDateKey()) {
  const currentActive = await prisma.destructionScrimRecruit.findFirst({
    where: {
      scrimNo,
      recruitDate,
      status: { in: ACTIVE_SCRIM_STATUSES },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (currentActive) return currentActive;

  const latestActive = await prisma.destructionScrimRecruit.findFirst({
    where: {
      scrimNo,
      status: { in: ACTIVE_SCRIM_STATUSES },
    },
    orderBy: [{ recruitDate: "desc" }, { updatedAt: "desc" }],
  });

  if (latestActive) return latestActive;

  const currentAnyStatus = await prisma.destructionScrimRecruit.findFirst({
    where: { scrimNo, recruitDate },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (currentAnyStatus) return currentAnyStatus;

  return prisma.destructionScrimRecruit.findFirst({
    where: { scrimNo },
    orderBy: [{ recruitDate: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getScrimStatusPayload(detailScrimNo?: number | null) {
  if (detailScrimNo) {
    const scrim = await findScrimForDetail(detailScrimNo);
    const scrims = scrim ? [scrim] : [];

    return {
      empty: scrims.length === 0,
      scrims,
      reply: scrim
        ? [
            "[K-LOL.GG 멸망전 스크림 상세]",
            "",
            formatScrimLine(scrim),
            "",
            buildScrimFormFromData(scrim),
          ].join("\n")
        : [
            "[K-LOL.GG 멸망전 스크림 상세]",
            "",
            `스크림 #${detailScrimNo}을 찾지 못했습니다.`,
          ].join("\n"),
    };
  }

  const scrims = await prisma.destructionScrimRecruit.findMany({
    where: { status: { in: ACTIVE_SCRIM_STATUSES } },
    orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
    take: 20,
  });

  return {
    empty: scrims.length === 0,
    scrims,
    reply: buildScrimStatusReply(scrims),
  };
}
