type ParticipantInput = {
  playerId: number;
  championId: number;
  team: "BLUE" | "RED";
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP";
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
};

type GameInput = {
  gameNumber: number;
  durationMin: number;
  winnerTeam: "BLUE" | "RED";
  participants: ParticipantInput[];
};

type MatchCreateInput = {
  seasonId: number;
  title: string;
  matchDate: string;
  games: GameInput[];
};

type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

const REQUIRED_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function validateMatchCreateInput(data: MatchCreateInput): ValidationResult {
  if (!data.seasonId || !data.title?.trim() || !data.matchDate) {
    return { ok: false, message: "기본 정보가 누락되었습니다." };
  }

  if (!Array.isArray(data.games) || data.games.length === 0) {
    return { ok: false, message: "최소 1세트 이상 필요합니다." };
  }

  for (const game of data.games) {
    if (!Array.isArray(game.participants) || game.participants.length !== 10) {
      return { ok: false, message: `${game.gameNumber}세트 참가자는 정확히 10명이어야 합니다.` };
    }

    const playerIds = game.participants.map((p) => p.playerId);
    const uniquePlayerIds = new Set(playerIds);
    if (uniquePlayerIds.size !== playerIds.length) {
      return { ok: false, message: `${game.gameNumber}세트에 중복된 플레이어가 있습니다.` };
    }

    const championIds = game.participants.map((p) => p.championId);
    const uniqueChampionIds = new Set(championIds);
    if (uniqueChampionIds.size !== championIds.length) {
      return { ok: false, message: `${game.gameNumber}세트에 중복된 챔피언이 있습니다.` };
    }

    const blueTeam = game.participants.filter((p) => p.team === "BLUE");
    const redTeam = game.participants.filter((p) => p.team === "RED");

    if (blueTeam.length !== 5 || redTeam.length !== 5) {
      return { ok: false, message: `${game.gameNumber}세트는 블루 5명, 레드 5명이어야 합니다.` };
    }

    const bluePositions = blueTeam.map((p) => p.position);
    const redPositions = redTeam.map((p) => p.position);

    const uniqueBluePositions = new Set(bluePositions);
    const uniqueRedPositions = new Set(redPositions);

    if (uniqueBluePositions.size !== 5) {
      return { ok: false, message: `${game.gameNumber}세트 블루팀 포지션이 중복되었습니다.` };
    }

    if (uniqueRedPositions.size !== 5) {
      return { ok: false, message: `${game.gameNumber}세트 레드팀 포지션이 중복되었습니다.` };
    }

    for (const position of REQUIRED_POSITIONS) {
      if (!uniqueBluePositions.has(position)) {
        return { ok: false, message: `${game.gameNumber}세트 블루팀에 ${position} 포지션이 없습니다.` };
      }

      if (!uniqueRedPositions.has(position)) {
        return { ok: false, message: `${game.gameNumber}세트 레드팀에 ${position} 포지션이 없습니다.` };
      }
    }
  }

  return { ok: true };
}