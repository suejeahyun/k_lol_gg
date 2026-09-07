export interface PrivateImageStorage {
  readonly storageProvider: string;
  stageAt(input: Readonly<{
    storageKey: string;
    bytes: Uint8Array;
    sha256Hex: string;
    signal: AbortSignal;
  }>): Promise<void>;
  read(storageKey: string, signal: AbortSignal): Promise<Uint8Array | null>;
  requestDelete(storageKey: string, signal: AbortSignal): Promise<void>;
}

export interface ScoreboardOcr {
  inspect(input: Readonly<{
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
    gameNumber: number;
    signal: AbortSignal;
  }>): Promise<ScoreboardOcrCandidateV1>;
}

export type ScoreboardOcrParticipantCandidate = Readonly<{
  slot: number;
  nickname: string | null;
  championKey: string | null;
  team: "BLUE" | "RED" | null;
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  confidence: number;
}>;

export type ScoreboardOcrCandidateV1 = Readonly<{
  schemaVersion: 1;
  provider: string;
  providerRequestReferenceHash: string | null;
  gameNumber: number;
  needsHumanReview: true;
  participants: readonly ScoreboardOcrParticipantCandidate[];
}>;
