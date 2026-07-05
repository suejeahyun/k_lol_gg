import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { DestructionScrimRecruitStatus, DestructionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import {
  buildScrimStatusReply,
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

export async function getNextScrimNo(recruitDate = getScrimRecruitDateKey()) {
  const latest = await prisma.destructionScrimRecruit.findFirst({
    where: { recruitDate },
    orderBy: { scrimNo: "desc" },
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

export async function getScrimStatusPayload(detailScrimNo?: number | null) {
  const where: Prisma.DestructionScrimRecruitWhereInput = detailScrimNo
    ? { scrimNo: detailScrimNo }
    : { status: { in: ACTIVE_SCRIM_STATUSES } };

  const scrims = await prisma.destructionScrimRecruit.findMany({
    where,
    orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
    take: detailScrimNo ? 1 : 20,
  });

  return {
    empty: scrims.length === 0,
    scrims,
    reply: detailScrimNo && scrims[0]
      ? ["[K-LOL.GG 멸망전 스크림 상세]", "", formatScrimLine(scrims[0])].join("\n")
      : buildScrimStatusReply(scrims),
  };
}
