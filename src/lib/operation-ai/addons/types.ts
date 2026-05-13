export type Severity = "LOW" | "MEDIUM" | "HIGH";

export type OperationIssue = {
  severity: Severity;
  title: string;
  description: string;
  suggestion?: string;
};

export type PositionKey = "TOP" | "JGL" | "MID" | "ADC" | "SUP" | "ALL" | "UNKNOWN";

export type PlayerTag = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  tags: string[];
  reasons: string[];
};

export type OperationModeRecommendation = {
  participantCount: number;
  mode: string;
  reason: string;
  warnings: string[];
};

export type NoticeType =
  | "NOON_RECRUIT"
  | "AFTERNOON_CHECK"
  | "EVENING_FINAL"
  | "START_SOON"
  | "POSITION_RECRUIT"
  | "TEAM_ANNOUNCE"
  | "RESULT_SUMMARY";

export type NoticeGenerateInput = {
  type?: NoticeType;
  slot?: string | number | null;
  roomName?: string | null;
  now?: Date;
};

export type OperationAiAddonDashboard = {
  generatedAt: string;
  season: { id: number; name: string } | null;
  today: {
    dateKey: string;
    participantCount: number;
    activeApplyCount: number;
    cancelledApplyCount: number;
    positionCounts: Record<string, number>;
    missingPositions: string[];
  };
  risk: {
    level: Severity;
    score: number;
    issues: OperationIssue[];
  };
  noShow: {
    riskyPlayers: Array<{
      playerId: number;
      name: string;
      nickname: string;
      tag: string;
      applied: number;
      cancelled: number;
      playedAfterApply: number;
      riskScore: number;
      reasons: string[];
    }>;
    spareCountRecommendation: number;
  };
  noticeSamples: Array<{ type: NoticeType; title: string; text: string }>;
  seasonReport: {
    totalSeries: number;
    totalGames: number;
    redWins: number;
    blueWins: number;
    topParticipants: Array<{ playerId: number; name: string; games: number; wins: number; winRate: number }>;
    topMvp: Array<{ playerId: number; name: string; mvpCount: number }>;
    notes: string[];
  };
  dataAudit: {
    dangerCount: number;
    warningCount: number;
    issues: OperationIssue[];
  };
  playerTags: PlayerTag[];
  operationMode: OperationModeRecommendation;
  balanceFailureLearning: {
    totalReviews: number;
    failedPredictionCount: number;
    patterns: Array<{ title: string; count: number; description: string }>;
  };
  championMastery: Array<{
    playerId: number;
    playerName: string;
    championName: string;
    games: number;
    wins: number;
    winRate: number;
    mvpCount: number;
  }>;
  todoPriority: OperationIssue[];
  newPlayerEstimates: Array<{
    playerId: number;
    name: string;
    nickname: string;
    provisionalScore: number;
    confidence: Severity;
    reason: string;
  }>;
};
