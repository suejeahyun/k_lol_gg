import { MATCH_POSITIONS, MATCH_TEAMS, type MatchGameInput } from "./match";

export type MatchReviewSeverity = "PASS" | "INFO" | "WARNING" | "ERROR";

export type MatchReviewFinding = Readonly<{
  id: string;
  severity: MatchReviewSeverity;
  title: string;
  detail: string;
}>;

type MatchReviewInput = Readonly<{
  status: "DRAFT" | "PUBLISHED" | "VOIDED";
  gameCount: number;
  blueWins: number;
  redWins: number;
  teamBalanceDraftId: string | null;
  games: readonly MatchGameInput[];
}>;

export type MatchIntegrityReview = Readonly<{
  grade: "PASS" | "REVIEW" | "BLOCK";
  errorCount: number;
  warningCount: number;
  findings: readonly MatchReviewFinding[];
}>;

function finding(id: string, severity: MatchReviewSeverity, title: string, detail: string): MatchReviewFinding {
  return { id, severity, title, detail };
}

export function analyzeMatchIntegrity(
  match: MatchReviewInput,
  catalog?: Readonly<{
    playerIds: ReadonlySet<string>;
    activePlayerIds: ReadonlySet<string>;
    championKeys: ReadonlySet<string>;
    activeChampionKeys: ReadonlySet<string>;
  }>,
): MatchIntegrityReview {
  const findings: MatchReviewFinding[] = [];
  const calculatedBlueWins = match.games.filter((game) => game.winnerTeam === "BLUE").length;
  const calculatedRedWins = match.games.filter((game) => game.winnerTeam === "RED").length;
  const aggregateMatches = match.gameCount === match.games.length && match.blueWins === calculatedBlueWins && match.redWins === calculatedRedWins;
  findings.push(finding(
    "series-aggregate",
    aggregateMatches ? "PASS" : "ERROR",
    "시리즈 집계",
    aggregateMatches
      ? `${match.games.length}경기 · 블루 ${calculatedBlueWins}승 · 레드 ${calculatedRedWins}승이 저장 집계와 일치합니다.`
      : `저장 집계(${match.gameCount}/${match.blueWins}:${match.redWins})와 실제 경기(${match.games.length}/${calculatedBlueWins}:${calculatedRedWins})가 다릅니다.`,
  ));

  findings.push(finding(
    "balance-provenance",
    match.teamBalanceDraftId ? "PASS" : "INFO",
    "팀 구성 출처",
    match.teamBalanceDraftId
      ? "팀 밸런스 초안 연결이 보존되어 있습니다."
      : "팀 밸런스 초안 없이 직접 구성한 경기입니다. 필요하면 운영 기록을 별도로 확인하세요.",
  ));

  for (const game of match.games) {
    const prefix = `${game.gameNumber}세트`;
    const playerIds = game.participants.map((participant) => participant.playerId);
    const championKeys = game.participants.map((participant) => participant.championKey);
    const uniquePlayers = new Set(playerIds);
    const uniqueChampions = new Set(championKeys);
    const blue = game.participants.filter((participant) => participant.team === "BLUE");
    const red = game.participants.filter((participant) => participant.team === "RED");
    const positionsComplete = MATCH_TEAMS.every((team) => {
      const participants = game.participants.filter((participant) => participant.team === team);
      return MATCH_POSITIONS.every((position) => participants.filter((participant) => participant.position === position).length === 1);
    });
    const structureOk = game.participants.length === 10 && uniquePlayers.size === 10 && uniqueChampions.size === 10 && blue.length === 5 && red.length === 5 && positionsComplete;
    findings.push(finding(
      `game-${game.gameNumber}-structure`,
      structureOk ? "PASS" : "ERROR",
      `${prefix} 로스터 구조`,
      structureOk
        ? "양 팀 5명, 포지션 5종, 선수·챔피언 중복 없음이 확인되었습니다."
        : "인원·포지션 또는 선수·챔피언 중복을 확인해야 합니다.",
    ));


    const blueKills = blue.reduce((sum, participant) => sum + participant.kills, 0);
    const redDeaths = red.reduce((sum, participant) => sum + participant.deaths, 0);
    const redKills = red.reduce((sum, participant) => sum + participant.kills, 0);
    const blueDeaths = blue.reduce((sum, participant) => sum + participant.deaths, 0);
    const statDelta = Math.max(Math.abs(blueKills - redDeaths), Math.abs(redKills - blueDeaths));
    findings.push(finding(
      `game-${game.gameNumber}-stats`,
      statDelta <= 2 ? "PASS" : "WARNING",
      `${prefix} 처치·사망 대조`,
      statDelta <= 2
        ? "양 팀 처치 합계와 상대 사망 합계가 허용 오차 안에서 맞습니다."
        : `최대 ${statDelta}건 차이가 있습니다. 처형 등 예외가 아니라면 원본 기록을 확인하세요.`,
    ));

    if (catalog) {
      const missingPlayers = [...uniquePlayers].filter((id) => !catalog.playerIds.has(id));
      const inactivePlayers = [...uniquePlayers].filter((id) => catalog.playerIds.has(id) && !catalog.activePlayerIds.has(id));
      const missingChampions = [...uniqueChampions].filter((key) => !catalog.championKeys.has(key));
      const inactiveChampions = [...uniqueChampions].filter((key) => catalog.championKeys.has(key) && !catalog.activeChampionKeys.has(key));
      const referencesOk = missingPlayers.length === 0 && missingChampions.length === 0;
      findings.push(finding(
        `game-${game.gameNumber}-references`,
        referencesOk ? (inactivePlayers.length || inactiveChampions.length ? "INFO" : "PASS") : "ERROR",
        `${prefix} 선수·챔피언 참조`,
        referencesOk
          ? inactivePlayers.length || inactiveChampions.length
            ? `기록 참조는 유효합니다. 현재 비활성 선수 ${inactivePlayers.length}명, 챔피언 ${inactiveChampions.length}개가 포함되어 있습니다.`
            : "모든 선수와 챔피언이 현재 카탈로그에 있습니다."
          : `카탈로그에서 찾을 수 없는 선수 ${missingPlayers.length}명, 챔피언 ${missingChampions.length}개가 있습니다.`,
      ));
    }
  }

  if (match.status === "PUBLISHED" && match.games.length === 0) {
    findings.push(finding("published-empty", "ERROR", "공개 상태", "공개 경기에는 최소 1세트가 필요합니다."));
  }
  const errorCount = findings.filter((item) => item.severity === "ERROR").length;
  const warningCount = findings.filter((item) => item.severity === "WARNING").length;
  return {
    grade: errorCount > 0 ? "BLOCK" : warningCount > 0 ? "REVIEW" : "PASS",
    errorCount,
    warningCount,
    findings,
  };
}
