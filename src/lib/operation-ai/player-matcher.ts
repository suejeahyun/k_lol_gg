import { prisma } from "@/lib/prisma/client";
import { normalizeParticipantName } from "@/lib/operation-ai/participation-parser";

type PlayerCandidate = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier: string | null;
  peakTier: string | null;
  score: number;
  reason: string;
};

function compact(value: string) {
  return normalizeParticipantName(value).replace(/\s+/g, "").toLowerCase();
}

function getCandidateScore(input: string, player: { name: string; nickname: string; tag: string }) {
  const target = compact(input);
  const name = compact(player.name);
  const nickname = compact(player.nickname);
  const riotId = compact(`${player.nickname}#${player.tag}`);

  if (!target) return { score: 0, reason: "EMPTY" };
  if (target === name) return { score: 100, reason: "NAME_EXACT" };
  if (target === nickname) return { score: 96, reason: "NICKNAME_EXACT" };
  if (target === riotId) return { score: 98, reason: "RIOT_ID_EXACT" };
  if (name.includes(target) || target.includes(name)) return { score: 82, reason: "NAME_PARTIAL" };
  if (nickname.includes(target) || target.includes(nickname)) return { score: 78, reason: "NICKNAME_PARTIAL" };

  return { score: 0, reason: "NO_MATCH" };
}

export async function matchPlayersByNames(names: string[]) {
  const players = await prisma.player.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      currentTier: true,
      peakTier: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const map: Record<string, PlayerCandidate[]> = {};

  for (const name of names) {
    const candidates = players
      .map((player) => {
        const result = getCandidateScore(name, player);
        return { ...player, score: result.score, reason: result.reason };
      })
      .filter((candidate) => candidate.score >= 70)
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, 5);

    map[name] = candidates;
  }

  return map;
}

export async function findOrCreateAutoPlayer(params: {
  name: string;
  currentTier: string | null;
  peakTier: string | null;
}) {
  const existing = await prisma.player.findFirst({
    where: {
      OR: [{ name: params.name }, { nickname: params.name }],
      isActive: true,
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (existing) return existing.id;

  for (let index = 1; index <= 999; index += 1) {
    const tag = index === 1 ? "AUTO" : `AUTO${index}`;
    const duplicated = await prisma.player.findUnique({
      where: { nickname_tag: { nickname: params.name, tag } },
      select: { id: true },
    });

    if (duplicated) continue;

    const player = await prisma.player.create({
      data: {
        name: params.name,
        nickname: params.name,
        tag,
        currentTier: params.currentTier,
        peakTier: params.peakTier,
      },
      select: { id: true },
    });

    return player.id;
  }

  throw new Error("AUTO_PLAYER_TAG_EXHAUSTED");
}
