import { prisma } from "@/lib/prisma/client";
import { normalizeParticipantName } from "@/lib/operation-ai/participation-parser";
import { matchPlayersByNames } from "@/lib/operation-ai/player-matcher";
import type { AiMatchResultExtraction } from "@/lib/operation-ai/match-result-image-extractor";

type ChampionCandidate = {
  id: number;
  name: string;
  imageUrl: string;
  score: number;
  reason: string;
};

function compact(value: string) {
  return normalizeParticipantName(value).replace(/\s+/g, "").toLowerCase();
}

function getChampionScore(input: string, champion: { name: string }) {
  const target = compact(input);
  const name = compact(champion.name);

  if (!target) return { score: 0, reason: "EMPTY" };
  if (target === name) return { score: 100, reason: "CHAMPION_EXACT" };
  if (name.includes(target) || target.includes(name)) return { score: 82, reason: "CHAMPION_PARTIAL" };

  return { score: 0, reason: "NO_MATCH" };
}

export async function matchChampionsByNames(names: string[]) {
  const champions = await prisma.champion.findMany({
    select: {
      id: true,
      name: true,
      imageUrl: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const map: Record<string, ChampionCandidate[]> = {};

  for (const name of names) {
    const candidates = champions
      .map((champion) => {
        const result = getChampionScore(name, champion);
        return { ...champion, score: result.score, reason: result.reason };
      })
      .filter((candidate) => candidate.score >= 70)
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, 5);

    map[name] = candidates;
  }

  return map;
}

export async function buildMatchedMatchResult(extraction: AiMatchResultExtraction) {
  const names = Array.from(
    new Set(
      extraction.games.flatMap((game) => game.participants.map((participant) => participant.name).filter(Boolean)),
    ),
  );

  const championNames = Array.from(
    new Set(
      extraction.games.flatMap((game) =>
        game.participants
          .map((participant) => participant.champion)
          .filter((champion): champion is string => Boolean(champion)),
      ),
    ),
  );

  const [playerCandidates, championCandidates] = await Promise.all([
    matchPlayersByNames(names),
    matchChampionsByNames(championNames),
  ]);

  return {
    ...extraction,
    games: extraction.games.map((game) => ({
      ...game,
      participants: game.participants.map((participant, participantIndex) => {
        const candidates = participant.name ? playerCandidates[participant.name] ?? [] : [];
        const championCandidateList = participant.champion ? championCandidates[participant.champion] ?? [] : [];
        const warnings: string[] = [];

        if (!participant.name) warnings.push("선수명을 인식하지 못했습니다.");
        if (!participant.team) warnings.push("팀을 인식하지 못했습니다.");
        if (!participant.position) warnings.push("라인을 인식하지 못했습니다.");
        if (!participant.champion) warnings.push("챔피언을 인식하지 못했습니다.");
        if (participant.kills === null || participant.deaths === null || participant.assists === null) {
          warnings.push("K/D/A를 완전히 인식하지 못했습니다.");
        }
        if (candidates.length === 0) warnings.push("DB 플레이어 매칭 후보가 없습니다.");
        if (participant.champion && championCandidateList.length === 0) warnings.push("DB 챔피언 매칭 후보가 없습니다.");

        return {
          rowId: `g${game.gameNumber}-p${participantIndex + 1}`,
          ...participant,
          selectedPlayerId: candidates[0]?.id ?? null,
          selectedChampionId: championCandidateList[0]?.id ?? null,
          playerCandidates: candidates,
          championCandidates: championCandidateList,
          warnings,
        };
      }),
    })),
  };
}
