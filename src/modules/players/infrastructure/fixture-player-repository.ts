import type { PlayerSummary } from "../domain/player";

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

export async function findFixturePlayers(query: string): Promise<readonly PlayerSummary[]> {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return fixturePlayers;

  return fixturePlayers.filter((player) =>
    `${player.displayName} ${player.riotId}`.toLocaleLowerCase("ko-KR").includes(normalized),
  );
}
