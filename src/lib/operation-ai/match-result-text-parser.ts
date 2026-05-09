import type { AiMatchResultExtraction, AiMatchResultParticipant } from "@/lib/operation-ai/match-result-image-extractor";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
type Position = (typeof POSITIONS)[number];
type Team = "BLUE" | "RED";

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeTeam(value: unknown): Team | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (["BLUE", "B", "블루", "BLUE팀", "블루팀"].includes(text)) return "BLUE";
  if (["RED", "R", "레드", "RED팀", "레드팀"].includes(text)) return "RED";
  return null;
}

function normalizePosition(value: unknown): Position | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (["TOP", "탑"].includes(text)) return "TOP";
  if (["JG", "JGL", "JUNGLE", "정글"].includes(text)) return "JGL";
  if (["MID", "MD", "미드"].includes(text)) return "MID";
  if (["AD", "ADC", "원딜"].includes(text)) return "ADC";
  if (["SUP", "SP", "SUPPORT", "서폿", "서포터"].includes(text)) return "SUP";
  return null;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.floor(number));
}

function asString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeParticipant(value: unknown): AiMatchResultParticipant {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const kills = source.kills ?? source.kill ?? source.k;
  const deaths = source.deaths ?? source.death ?? source.d;
  const assists = source.assists ?? source.assist ?? source.a;

  return {
    name: asString(source.name ?? source.playerName ?? source.player ?? source.nickname),
    champion: asString(source.champion ?? source.championName ?? source.champ) || null,
    team: normalizeTeam(source.team),
    position: normalizePosition(source.position ?? source.line ?? source.role),
    kills: toNullableNumber(kills),
    deaths: toNullableNumber(deaths),
    assists: toNullableNumber(assists),
    rawText: asString(source.rawText) || null,
    confidence: toNullableNumber(source.confidence),
  };
}

function normalizeJsonExtraction(value: unknown, rawText: string): AiMatchResultExtraction {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const gamesSource = Array.isArray(source.games) ? source.games : [];
  const warnings = Array.isArray(source.warnings)
    ? source.warnings.map((item) => String(item)).filter(Boolean)
    : [];

  const games = gamesSource.map((gameSource, gameIndex) => {
    const game = gameSource && typeof gameSource === "object" ? (gameSource as Record<string, unknown>) : {};
    const participantsSource = Array.isArray(game.participants) ? game.participants : [];

    return {
      gameNumber: toNullableNumber(game.gameNumber) ?? gameIndex + 1,
      winnerTeam: normalizeTeam(game.winnerTeam ?? game.winner),
      warnings: Array.isArray(game.warnings) ? game.warnings.map((item) => String(item)).filter(Boolean) : [],
      participants: participantsSource.map(normalizeParticipant),
    };
  });

  return {
    titleHint: asString(source.title ?? source.titleHint) || null,
    matchDateHint: asString(source.matchDate ?? source.matchDateHint ?? source.date) || null,
    rawText,
    warnings,
    games,
  };
}

function parseKda(text: string) {
  const match = text.match(/(\d+)\s*[\/\-:]\s*(\d+)\s*[\/\-:]\s*(\d+)/);
  if (!match) return { kills: null, deaths: null, assists: null, rest: text };

  return {
    kills: Number(match[1]),
    deaths: Number(match[2]),
    assists: Number(match[3]),
    rest: `${text.slice(0, match.index)} ${text.slice((match.index ?? 0) + match[0].length)}`.trim(),
  };
}

function parseLooseLine(line: string, currentTeam: Team | null, currentGameNumber: number): AiMatchResultParticipant | null {
  const cleaned = line
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();

  if (!cleaned) return null;

  const tokens = cleaned.split(/[\s,|]+/).filter(Boolean);
  if (tokens.length < 3) return null;

  let team = normalizeTeam(tokens[0]) ?? currentTeam;
  let position: Position | null = null;
  let cursor = 0;

  if (normalizeTeam(tokens[cursor])) {
    team = normalizeTeam(tokens[cursor]);
    cursor += 1;
  }

  if (normalizePosition(tokens[cursor])) {
    position = normalizePosition(tokens[cursor]);
    cursor += 1;
  }

  const kda = parseKda(cleaned);
  const remainingTokens = kda.rest.split(/[\s,|]+/).filter(Boolean).slice(cursor);

  if (remainingTokens.length < 2) return null;

  const name = remainingTokens[0];
  const champion = remainingTokens[1];

  return {
    name,
    champion,
    team,
    position,
    kills: kda.kills,
    deaths: kda.deaths,
    assists: kda.assists,
    rawText: `${currentGameNumber}세트 ${line}`,
    confidence: null,
  };
}

function parseLooseText(text: string): AiMatchResultExtraction {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const games: AiMatchResultExtraction["games"] = [];
  const warnings: string[] = ["JSON이 아닌 빠른 입력 형식으로 분석했습니다. 세트/팀/라인/KDA를 확인하세요."];

  let currentGameNumber = 1;
  let currentTeam: Team | null = null;
  let currentWinner: Team | null = null;
  let participants: AiMatchResultParticipant[] = [];

  function pushGame() {
    if (participants.length === 0) return;
    games.push({
      gameNumber: currentGameNumber,
      winnerTeam: currentWinner,
      participants,
      warnings: participants.length !== 10 ? [`${currentGameNumber}세트 참가자가 10명이 아닙니다.`] : [],
    });
    participants = [];
    currentWinner = null;
    currentTeam = null;
  }

  for (const line of lines) {
    const gameMatch = line.match(/(\d+)\s*세트|game\s*(\d+)/i);
    if (gameMatch) {
      pushGame();
      currentGameNumber = Number(gameMatch[1] ?? gameMatch[2] ?? 1);
      continue;
    }

    if (/승리|winner|win/i.test(line)) {
      const winner = normalizeTeam(line.replace(/승리|winner|win|[:：]/gi, " "));
      if (winner) currentWinner = winner;
      continue;
    }

    const teamOnly = normalizeTeam(line.replace(/팀|team|[:：]/gi, " "));
    if (teamOnly && !parseKda(line).kills) {
      currentTeam = teamOnly;
      continue;
    }

    const participant = parseLooseLine(line, currentTeam, currentGameNumber);
    if (participant) participants.push(participant);
  }

  pushGame();

  return {
    titleHint: null,
    matchDateHint: null,
    rawText: text,
    warnings,
    games,
  };
}

export function parseMatchResultText(text: string): AiMatchResultExtraction {
  const stripped = stripJsonFence(text);

  try {
    const parsed = JSON.parse(stripped) as unknown;
    return normalizeJsonExtraction(parsed, text);
  } catch {
    return parseLooseText(text);
  }
}
