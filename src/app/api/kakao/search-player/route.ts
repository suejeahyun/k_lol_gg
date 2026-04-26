import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { parseNickname } from "@/lib/kakao/parser";
import { createSimpleText } from "@/lib/kakao/response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const utterance: string = body?.userRequest?.utterance || "";

    if (!utterance) {
      return NextResponse.json(
        createSimpleText("입력값이 없습니다.")
      );
    }

    const { nickname, tag } = parseNickname(utterance);

    // 플레이어 조회
    const player = await prisma.player.findFirst({
      where: tag
        ? {
            nickname: {
              contains: nickname,
              mode: "insensitive",
            },
            tag: {
              contains: tag,
              mode: "insensitive",
            },
          }
        : {
            nickname: {
              contains: nickname,
              mode: "insensitive",
            },
          },
    });

    if (!player) {
      return NextResponse.json(
        createSimpleText("Player not found.")
      );
    }

    // 현재 시즌
    const season = await prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
    });

    if (!season) {
      return NextResponse.json(
        createSimpleText("현재 시즌이 없습니다.")
      );
    }

    // 참가 기록
    const participants = await prisma.matchParticipant.findMany({
      where: {
        playerId: player.id,
        game: {
          series: {
            seasonId: season.id,
          },
        },
      },
      include: {
        game: true,
        champion: true,
      },
    });

    if (participants.length === 0) {
      return NextResponse.json(
        createSimpleText("전적 데이터가 없습니다.")
      );
    }

    // 통계 계산
    let wins = 0;
    let losses = 0;
    let kills = 0;
    let deaths = 0;
    let assists = 0;

    participants.forEach((p) => {
      const win = p.team === p.game.winnerTeam;

      if (win) wins++;
      else losses++;

      kills += p.kills;
      deaths += p.deaths;
      assists += p.assists;
    });

    const total = wins + losses;
    const winRate = ((wins / total) * 100).toFixed(1);
    const kda =
      deaths === 0
        ? (kills + assists).toFixed(2)
        : ((kills + assists) / deaths).toFixed(2);

    // 최근 5경기
    const recent = participants.slice(0, 5);

    const recentText = recent
      .map((p, i) => {
        const result = p.team === p.game.winnerTeam ? "승" : "패";
        return `${i + 1}. ${result} / ${p.champion.name} / ${p.kills}-${p.deaths}-${p.assists}`;
      })
      .join("\n");

    const text = `
[${player.nickname}${player.tag ? `${player.tag.startsWith("#") ? "" : "#"}${player.tag}` : ""}]

총 경기: ${total}전
승리: ${wins}승 / 패배: ${losses}패
승률: ${winRate}%
KDA: ${kda}

최근 경기
${recentText}
`.trim();

    return NextResponse.json(createSimpleText(text));
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      createSimpleText("서버 오류 발생")
    );
  }
}