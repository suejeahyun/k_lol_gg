import type { PlayerSummary } from "../domain/player";
import type { PlayerRepository } from "../application/ports/player-repository";

const fixturePlayers: readonly PlayerSummary[] = [
  {
    id: "fixture-sky-fox",
    displayName: "하늘여우",
    riotId: "SkyFox#V2",
    mainPosition: "MID",
    tier: "PLATINUM IV",
    recentMatches: 18,
    winRate: 61,
  },
  {
    id: "fixture-lilac-star",
    displayName: "라일락별",
    riotId: "LilacStar#KLOL",
    mainPosition: "SUPPORT",
    tier: "EMERALD III",
    recentMatches: 16,
    winRate: 56,
  },
  {
    id: "fixture-peach-breeze",
    displayName: "복숭아바람",
    riotId: "PeachWind#LOVE",
    mainPosition: "ADC",
    tier: "GOLD I",
    recentMatches: 12,
    winRate: 50,
  },
  {
    id: "fixture-mint-cloud",
    displayName: "민트구름",
    riotId: "MintCloud#PLAY",
    mainPosition: "JUNGLE",
    tier: "PLATINUM II",
    recentMatches: 20,
    winRate: 65,
  },
];

export const fixturePlayerRepository: PlayerRepository = {
  async search(query) {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return fixturePlayers;

    return fixturePlayers.filter((player) =>
      `${player.displayName} ${player.riotId}`.toLocaleLowerCase("ko-KR").includes(normalized),
    );
  },
  async getCatalog({ query, page, pageSize }) {
    const matches = await this.search(query);
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    return {
      items: matches.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      totalCount: matches.length,
      currentPage,
      totalPages,
      pageSize,
    };
  },
  async findById(id) {
    const player = fixturePlayers.find((candidate) => candidate.id === id);
    if (!player) return null;

    return {
      id: player.id,
      displayName: player.displayName,
      riotId: player.riotId,
      currentTier: player.tier,
      peakTier: player.tier,
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      seasonStats: null,
      positionStats: [],
      championStats: [],
      recentMatches: [],
    };
  },
};
