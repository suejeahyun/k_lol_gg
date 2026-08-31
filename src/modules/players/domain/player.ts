export type PlayerSummary = Readonly<{
  id: string;
  displayName: string;
  riotId: string;
  mainPosition: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";
  tier: string;
  recentMatches: number;
  winRate: number;
}>;
