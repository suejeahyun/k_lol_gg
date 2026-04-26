export type KakaoRequest = {
  userRequest: {
    utterance: string;
  };
};

export type KakaoSkillResponse = {
  version: "2.0";
  template: {
    outputs: Array<{
      basicCard: {
        title: string;
        description: string;
      };
    }>;
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