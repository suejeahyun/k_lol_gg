type Team = "BLUE" | "RED";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type ParticipantInput = {
  playerId: number;
  championId: number;
  team: Team;
  position: Position;
  kills: number;
  deaths: number;
  assists: number;
};

type GameInput = {
  gameNumber: number;
  winnerTeam?: Team;
  participants: ParticipantInput[];
};

type MatchCreateInput = {
  seasonId: number;
  title: string;
  matchDate: string;
  games: GameInput[];
};

type ValidationResult = { ok: true } | { ok: false; message: string };

const REQUIRED_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function validateMatchCreateInput(
  data: MatchCreateInput
): ValidationResult {
  if (!data || typeof data !== "object") {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  if (!Number.isInteger(data.seasonId) || data.seasonId <= 0) {
    return { ok: false, message: "시즌 정보가 올바르지 않습니다." };
  }

  if (typeof data.title !== "string" || !data.title.trim()) {
    return { ok: false, message: "내전 제목을 입력해주세요." };
  }

  if (data.title.trim().length > 100) {
    return { ok: false, message: "내전 제목은 100자 이하로 입력해주세요." };
  }

  if (typeof data.matchDate !== "string" || !data.matchDate.trim()) {
    return { ok: false, message: "내전 일시를 입력해주세요." };
  }

  const parsedDate = new Date(data.matchDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return { ok: false, message: "내전 일시 형식이 올바르지 않습니다." };
  }

  if (!Array.isArray(data.games) || data.games.length === 0) {
    return { ok: false, message: "최소 1세트 이상 필요합니다." };
  }

  const gameNumbers = data.games.map((game) => game.gameNumber);
  if (new Set(gameNumbers).size !== gameNumbers.length) {
    return { ok: false, message: "세트 번호가 중복되었습니다." };
  }

  for (const game of data.games) {
    const gameLabel = `${game.gameNumber}세트`;

    if (!Number.isInteger(game.gameNumber) || game.gameNumber <= 0) {
      return { ok: false, message: "세트 번호가 올바르지 않습니다." };
    }

    if (game.winnerTeam !== undefined && !["BLUE", "RED"].includes(game.winnerTeam)) {
      return { ok: false, message: `${gameLabel} 승리팀 정보가 올바르지 않습니다.` };
    }

    if (!Array.isArray(game.participants) || game.participants.length !== 10) {
      return {
        ok: false,
        message: `${gameLabel} 참가자는 정확히 10명이어야 합니다.`,
      };
    }

    const blueTeam = game.participants.filter(
      (participant) => participant.team === "BLUE"
    );
    const redTeam = game.participants.filter(
      (participant) => participant.team === "RED"
    );

    if (blueTeam.length !== 5 || redTeam.length !== 5) {
      return {
        ok: false,
        message: `${gameLabel}는 블루 5명, 레드 5명이어야 합니다.`,
      };
    }

    const playerIds = game.participants.map((participant) => participant.playerId);
    if (playerIds.some((playerId) => !Number.isInteger(playerId) || playerId <= 0)) {
      return {
        ok: false,
        message: `${gameLabel}에 선택되지 않은 플레이어가 있습니다.`,
      };
    }

    if (new Set(playerIds).size !== playerIds.length) {
      return {
        ok: false,
        message: `${gameLabel}에 중복된 플레이어가 있습니다.`,
      };
    }

    const championIds = game.participants.map(
      (participant) => participant.championId
    );
    if (
      championIds.some(
        (championId) => !Number.isInteger(championId) || championId <= 0
      )
    ) {
      return {
        ok: false,
        message: `${gameLabel}에 선택되지 않은 챔피언이 있습니다.`,
      };
    }

    if (new Set(championIds).size !== championIds.length) {
      return {
        ok: false,
        message: `${gameLabel}에 중복된 챔피언이 있습니다.`,
      };
    }

    for (const participant of game.participants) {
      if (!["BLUE", "RED"].includes(participant.team)) {
        return {
          ok: false,
          message: `${gameLabel} 팀 정보가 올바르지 않습니다.`,
        };
      }

      if (!REQUIRED_POSITIONS.includes(participant.position)) {
        return {
          ok: false,
          message: `${gameLabel} 포지션 정보가 올바르지 않습니다.`,
        };
      }

      if (!isNonNegativeInteger(participant.kills)) {
        return {
          ok: false,
          message: `${gameLabel} 킬은 0 이상의 정수만 입력할 수 있습니다.`,
        };
      }

      if (!isNonNegativeInteger(participant.deaths)) {
        return {
          ok: false,
          message: `${gameLabel} 데스는 0 이상의 정수만 입력할 수 있습니다.`,
        };
      }

      if (!isNonNegativeInteger(participant.assists)) {
        return {
          ok: false,
          message: `${gameLabel} 어시스트는 0 이상의 정수만 입력할 수 있습니다.`,
        };
      }
    }

    const bluePositions = new Set(blueTeam.map((participant) => participant.position));
    const redPositions = new Set(redTeam.map((participant) => participant.position));

    if (bluePositions.size !== 5) {
      return {
        ok: false,
        message: `${gameLabel} 블루팀 포지션이 중복되었습니다.`,
      };
    }

    if (redPositions.size !== 5) {
      return {
        ok: false,
        message: `${gameLabel} 레드팀 포지션이 중복되었습니다.`,
      };
    }

    for (const position of REQUIRED_POSITIONS) {
      if (!bluePositions.has(position)) {
        return {
          ok: false,
          message: `${gameLabel} 블루팀에 ${position} 포지션이 없습니다.`,
        };
      }

      if (!redPositions.has(position)) {
        return {
          ok: false,
          message: `${gameLabel} 레드팀에 ${position} 포지션이 없습니다.`,
        };
      }
    }
  }

  return { ok: true };
}