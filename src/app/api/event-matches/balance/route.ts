import { NextRequest, NextResponse } from "next/server";
import { Position } from "@prisma/client";

type BalanceMode = "POSITION" | "ARAM";

type ParticipantInput = {
  playerId: number;
  name?: string;
  nickname?: string;
  tag?: string;
  position?: Position | null;
  balanceScore?: number;
};

type BalancedTeam = {
  name: string;
  seed: number;
  score: number;
  memberPlayerIds: number[];
  members: ParticipantInput[];
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isValidMode(mode: string): mode is BalanceMode {
  return mode === "POSITION" || mode === "ARAM";
}

function getScore(participant: ParticipantInput): number {
  const score = Number(participant.balanceScore ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function buildAramTeams(participants: ParticipantInput[]): BalancedTeam[] {
  const teamCount = participants.length / 5;

  const teams: BalancedTeam[] = Array.from({ length: teamCount }, (_, index) => ({
    name: `${String.fromCharCode(65 + index)}팀`,
    seed: index + 1,
    score: 0,
    memberPlayerIds: [],
    members: [],
  }));

  const sorted = [...participants].sort((a, b) => getScore(b) - getScore(a));

  sorted.forEach((participant) => {
    const targetTeam = [...teams].sort((a, b) => {
      if (a.members.length !== b.members.length) {
        return a.members.length - b.members.length;
      }

      return a.score - b.score;
    })[0];

    targetTeam.members.push(participant);
    targetTeam.memberPlayerIds.push(Number(participant.playerId));
    targetTeam.score += getScore(participant);
  });

  return teams.map((team) => ({
    ...team,
    score: Number(team.score.toFixed(2)),
  }));
}

function buildPositionTeams(participants: ParticipantInput[]): BalancedTeam[] {
  const teamCount = participants.length / 5;

  const teams: BalancedTeam[] = Array.from({ length: teamCount }, (_, index) => ({
    name: `${String.fromCharCode(65 + index)}팀`,
    seed: index + 1,
    score: 0,
    memberPlayerIds: [],
    members: [],
  }));

  for (const position of POSITIONS) {
    const positionPlayers = participants
      .filter((participant) => participant.position === position)
      .sort((a, b) => getScore(b) - getScore(a));

    if (positionPlayers.length !== teamCount) {
      throw new Error(
        `${position} 포지션은 팀 수와 동일한 ${teamCount}명이 필요합니다.`
      );
    }

    positionPlayers.forEach((participant) => {
      const targetTeam = [...teams].sort((a, b) => {
        const aHasPosition = a.members.some(
          (member) => member.position === position
        );
        const bHasPosition = b.members.some(
          (member) => member.position === position
        );

        if (aHasPosition !== bHasPosition) {
          return aHasPosition ? 1 : -1;
        }

        return a.score - b.score;
      })[0];

      targetTeam.members.push(participant);
      targetTeam.memberPlayerIds.push(Number(participant.playerId));
      targetTeam.score += getScore(participant);
    });
  }

  return teams.map((team) => ({
    ...team,
    score: Number(team.score.toFixed(2)),
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const mode = String(body.mode ?? "POSITION");
    const participants: ParticipantInput[] = Array.isArray(body.participants)
      ? body.participants
      : [];

    if (!isValidMode(mode)) {
      return NextResponse.json(
        { message: "밸런스 모드가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (participants.length < 10) {
      return NextResponse.json(
        { message: "참가자는 최소 10명 이상이어야 합니다." },
        { status: 400 }
      );
    }

    if (participants.length % 5 !== 0) {
      return NextResponse.json(
        { message: "참가자는 5명 단위로 입력해야 합니다." },
        { status: 400 }
      );
    }

    const playerIds = participants.map((participant) =>
      Number(participant.playerId)
    );

    const hasInvalidPlayerId = playerIds.some((playerId) =>
      Number.isNaN(playerId)
    );

    if (hasInvalidPlayerId) {
      return NextResponse.json(
        { message: "플레이어 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const duplicatedPlayerIds = playerIds.filter(
      (playerId, index, arr) => arr.indexOf(playerId) !== index
    );

    if (duplicatedPlayerIds.length > 0) {
      return NextResponse.json(
        { message: "중복된 참가자가 있습니다." },
        { status: 400 }
      );
    }

    if (mode === "POSITION") {
      const hasEmptyPosition = participants.some(
        (participant) => !participant.position
      );

      if (hasEmptyPosition) {
        return NextResponse.json(
          { message: "포지션 모드에서는 모든 참가자의 라인이 필요합니다." },
          { status: 400 }
        );
      }

      const invalidPosition = participants.some(
        (participant) =>
          participant.position &&
          !POSITIONS.includes(participant.position)
      );

      if (invalidPosition) {
        return NextResponse.json(
          { message: "올바르지 않은 포지션이 포함되어 있습니다." },
          { status: 400 }
        );
      }
    }

    const teams =
      mode === "ARAM"
        ? buildAramTeams(participants)
        : buildPositionTeams(participants);

    const maxScore = Math.max(...teams.map((team) => team.score));
    const minScore = Math.min(...teams.map((team) => team.score));
    const scoreGap = Number((maxScore - minScore).toFixed(2));

    return NextResponse.json({
      mode,
      teamCount: teams.length,
      participantCount: participants.length,
      scoreGap,
      teams,
    });
  } catch (error) {
    console.error("[EVENT_MATCH_BALANCE_POST_ERROR]", error);

    const message =
      error instanceof Error
        ? error.message
        : "이벤트 팀 자동 생성 실패";

    return NextResponse.json({ message }, { status: 500 });
  }
}