export type PlayerSummary = Readonly<{
  id: string;
  displayName: string;
  riotId: string;
  mainPosition: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | null;
  tier: string | null;
  recentMatches: number | null;
  winRate: number | null;
}>;
