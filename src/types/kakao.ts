export type KakaoPlayerSearchInput = {
  rawText: string;
  nickname: string;
  tag: string;
};

export type PlayerSummaryResult = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
};

export type KakaoSimpleTextResponse = {
  version: "2.0";
  template: {
    outputs: Array<
      | {
          simpleText: {
            text: string;
          };
        }
      | {
          basicCard: {
            title: string;
            description: string;
          };
        }
    >;
  };
};