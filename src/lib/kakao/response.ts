import { PlayerSummaryResult, KakaoSimpleTextResponse } from "@/types/kakao";

export function createKakaoErrorResponse(message: string): KakaoSimpleTextResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text: message,
          },
        },
      ],
    },
  };
}

export function createKakaoPlayerSummaryResponse(
  summary: PlayerSummaryResult
): KakaoSimpleTextResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          basicCard: {
            title: `${summary.nickname}#${summary.tag}`,
            description:
              `이름: ${summary.name}\n` +
              `총판수: ${summary.totalGames}판\n` +
              `승률: ${summary.winRate}%\n` +
              `KDA: ${summary.kda}\n` +
              `평균 K/D/A: ${summary.avgKills} / ${summary.avgDeaths} / ${summary.avgAssists}`,
          },
        },
      ],
    },
  };
}