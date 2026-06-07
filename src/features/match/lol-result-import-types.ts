export type Team = "BLUE" | "RED";

export type LolChampionCandidate = {
  championName: string;
  confidence: number;
};

export type LolResultImportRow = {
  side: "TOP" | "BOTTOM";
  rowIndex: number;
  playerName: string;
  championName: string | null;
  championConfidence: number;
  championCandidates: LolChampionCandidate[];
  championPreviewDataUrl: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kdaText: string;
  warnings: string[];
};

export type LolResultImportResponse = {
  resultText: string;
  topPlayerName: string;
  rows: LolResultImportRow[];
  warnings: string[];
};
