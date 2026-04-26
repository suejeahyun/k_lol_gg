export type KakaoRequest = {
  userRequest: {
    utterance: string;
  };
};

export type KakaoSimpleText = {
  version: "2.0";
  template: {
    outputs: Array<{
      simpleText: {
        text: string;
      };
    }>;
    quickReplies: [];
  };
};
export type PlayerSummaryResult = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string | null;

  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;

  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
};