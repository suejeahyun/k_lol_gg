import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { createSimpleText } from "@/lib/kakao/response";

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTag(tag: string | null | undefined) {
  if (!tag) return "";
  return tag.trim().replace(/^#/, "").toLowerCase();
}

function parseSearchKeyword(input: string) {
  let text = input.trim();

  text = text.replace(/^전적검색\s*/i, "");
  text = text.replace(/^전적\s*/i, "");
  text = text.trim();

  if (!text) {
    return {
      nickname: "",
      tag: "",
    };
  }

  if (text.includes("#")) {
    const [nickname, tag] = text.split("#");

    return {
      nickname: nickname.trim(),
      tag: tag.trim().replace(/^#/, ""),
    };
  }

  return {
    nickname: text,
    tag: "",
  };
}

function formatPlayerName(player: {
  nickname: string;
  tag: string | null;
}) {
  const tag = player.tag ? player.tag.replace(/^#/, "") : "";

  return tag ? `${player.nickname}#${tag}` : player.nickname;
}

function getKda(kills: number, deaths: number, assists: number) {
  if (deaths === 0) return kills + assists;
  return (kills + assists) / deaths;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const paramNickname =
      body?.action?.params?.nickname ||
      body?.action?.detailParams?.nickname?.origin ||
      body?.action?.detailParams?.nickname?.value ||
      "";

    const rawInput =
      String(paramNickname || body?.userRequest?.utterance || "").trim();

    const { nickname, tag } = parseSearchKeyword(rawInput);

    if (!nickname) {
      return NextResponse.json(
        createSimpleText("닉네임을 입력해주세요.\n예: pokey")
      );
    }

    const normalizedNickname = normalizeText(nickname);
    const normalizedTag = normalizeTag(tag);

    const players = await prisma.player.findMany({
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
      },
    });

    const matchedPlayers = players.filter((player) => {
      const playerNickname = normalizeText(player.nickname);
      const playerTag = normalizeTag(player.tag);

      if (normalizedTag) {
        return (
          playerNickname === normalizedNickname &&
          playerTag === normalizedTag
        );
      }

      return playerNickname === normalizedNickname;
    });

    if (matchedPlayers.length === 0) {
      return NextResponse.json(
        createSimpleText(
          `해당 닉네임의 전적을 찾을 수 없습니다.\n입력값: ${nickname}`
        )
      );
    }

    if (matchedPlayers.length > 1 && !normalizedTag) {
      const names = matchedPlayers
        .slice(0, 5)
        .map((player) => `- ${formatPlayerName(player)}`)
        .join("\n");

      return NextResponse.json(
        createSimpleText(
          `동일한 닉네임이 여러 명 있습니다.\n태그까지 입력해주세요.\n예: ${formatPlayerName(
            matchedPlayers[0]
          )}\n\n검색 결과\n${names}`
        )
      );
    }

    const player = matchedPlayers[0];

    const season = await prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
    });

    if (!season) {
      return NextResponse.json(createSimpleText("현재 시즌이 없습니다."));
    }

    const allParticipants = await prisma.matchParticipant.findMany({
      where: {
        game: {
          series: {
            seasonId: season.id,
          },
        },
      },
      include: {
        player: {
          select: {
            id: true,
            nickname: true,
            tag: true,
          },
        },
        champion: {
          select: {
            name: true,
          },
        },
        game: {
          include: {
            series: {
              select: {
                matchDate: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    const playerStatsMap = new Map<
      number,
      {
        playerId: number;
        nickname: string;
        tag: string | null;
        totalGames: number;
        wins: number;
        losses: number;
        kills: number;
        deaths: number;
        assists: number;
      }
    >();

    for (const participant of allParticipants) {
      const stat = playerStatsMap.get(participant.playerId) ?? {
        playerId: participant.playerId,
        nickname: participant.player.nickname,
        tag: participant.player.tag,
        totalGames: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };

      const isWin = participant.team === participant.game.winnerTeam;

      stat.totalGames += 1;
      stat.wins += isWin ? 1 : 0;
      stat.losses += isWin ? 0 : 1;
      stat.kills += participant.kills;
      stat.deaths += participant.deaths;
      stat.assists += participant.assists;

      playerStatsMap.set(participant.playerId, stat);
    }

    const rankings = Array.from(playerStatsMap.values()).map((stat) => {
      const winRate =
        stat.totalGames > 0 ? (stat.wins / stat.totalGames) * 100 : 0;

      const kda = getKda(stat.kills, stat.deaths, stat.assists);

      return {
        ...stat,
        winRate,
        kda,
      };
    });

    const winRateRanking = [...rankings]
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.totalGames - a.totalGames;
      })
      .findIndex((item) => item.playerId === player.id);

    const kdaRanking = [...rankings]
      .sort((a, b) => {
        if (b.kda !== a.kda) return b.kda - a.kda;
        return b.totalGames - a.totalGames;
      })
      .findIndex((item) => item.playerId === player.id);

    const participationRanking = [...rankings]
      .sort((a, b) => {
        if (b.totalGames !== a.totalGames) {
          return b.totalGames - a.totalGames;
        }

        return b.winRate - a.winRate;
      })
      .findIndex((item) => item.playerId === player.id);

    const currentPlayerStat = rankings.find(
      (item) => item.playerId === player.id
    );

    if (!currentPlayerStat || currentPlayerStat.totalGames === 0) {
      return NextResponse.json(
        createSimpleText(
          `[${formatPlayerName(player)}]\n현재 시즌 전적 데이터가 없습니다.`
        )
      );
    }

    const recentParticipants = allParticipants
      .filter((participant) => participant.playerId === player.id)
      .slice(0, 5);

    const recentText =
      recentParticipants.length > 0
        ? recentParticipants
            .map((participant, index) => {
              const result =
                participant.team === participant.game.winnerTeam ? "승" : "패";

              return `${index + 1}. ${result} / ${
                participant.champion.name
              } / ${participant.kills}-${participant.deaths}-${
                participant.assists
              }`;
            })
            .join("\n")
        : "최근 경기 없음";

    const text = `
[${formatPlayerName(player)}]

총 경기: ${currentPlayerStat.totalGames}전
승리: ${currentPlayerStat.wins}승 / 패배: ${currentPlayerStat.losses}패
승률: ${roundOne(currentPlayerStat.winRate)}%
KDA: ${roundOne(currentPlayerStat.kda)}

랭킹
승률 랭킹: ${winRateRanking + 1}등
KDA 랭킹: ${kdaRanking + 1}등
최다 참여 랭킹: ${participationRanking + 1}등

최근 경기 5경기
${recentText}
`.trim();

    return NextResponse.json(createSimpleText(text));
  } catch (error) {
    console.error("[KAKAO_SEARCH_PLAYER_ERROR]", error);

    return NextResponse.json(
      createSimpleText(
        "전적 검색 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요."
      ),
      { status: 200 }
    );
  }
}