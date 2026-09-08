import type { PlayerSummary } from "../domain/player";
import type { PlayerRepository } from "../application/ports/player-repository";
import { playerTierFamily } from "../domain/player-tier";

const fixtureMemberNames: Readonly<Record<string, string>> = {
  "fixture-sky-fox": "김하늘",
  "fixture-lilac-star": "박라일락",
  "fixture-peach-breeze": "이복숭아",
  "fixture-mint-cloud": "최민트",
};

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

    return fixturePlayers.filter((player) => {
      const memberName = (fixtureMemberNames[player.id] ?? "").toLocaleLowerCase("ko-KR");
      const publicIdentity = `${player.displayName} ${player.riotId}`.toLocaleLowerCase("ko-KR");
      return memberName === normalized || publicIdentity.includes(normalized);
    });
  },
  async getCatalog({ query, tier, page, pageSize }) {
    const matches = await this.search(query);
    const tierMatches = tier
      ? matches.filter((player) => playerTierFamily(player.tier) === tier)
      : matches;
    const totalPages = Math.max(1, Math.ceil(tierMatches.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    return {
      items: tierMatches.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      totalCount: tierMatches.length,
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
