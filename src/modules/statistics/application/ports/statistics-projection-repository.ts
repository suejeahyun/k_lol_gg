export type MatchChangedAction = "CREATED" | "AMENDED" | "PUBLISHED" | "VOIDED" | "RESTORED";

export type ClaimedMatchChangedEvent = Readonly<{
  eventId: string;
  eventType: "MATCH_CHANGED";
  action: MatchChangedAction;
  matchId: string;
  matchRevision: number;
  oldSeasonId: string | null;
  newSeasonId: string | null;
  inputDigest: Buffer;
  lockedAt: Date;
}>;

export type SeasonProjectionApplyResult = Readonly<{
  seasonId: string;
  generation: number;
  sourceMatchCount: number;
  sourceGameCount: number;
  sourceParticipantCount: number;
  sourceChecksumHex: string;
}>;

export type MatchChangedApplyResult = Readonly<{
  eventId: string;
  kind: "APPLIED" | "REPLAYED";
  affectedSeasonIds: readonly string[];
  projections: readonly SeasonProjectionApplyResult[];
}>;

export interface StatisticsProjectionRepository {
  /** Claims one S04 event using a durable DB lease. */
  claimNextMatchChanged(now: Date): Promise<ClaimedMatchChangedEvent | null>;

  /**
   * In one transaction, verifies the lease, locks every affected season in canonical
   * order, rebuilds each from current PUBLISHED S04 rows, publishes all generations,
   * inserts the event receipt and marks the S04 outbox row DELIVERED. A receipt replay
   * must not rewrite projection rows or advance a generation.
   */
  applyClaimedMatchChanged(input: Readonly<{
    event: ClaimedMatchChangedEvent;
    affectedSeasonIds: readonly string[];
    now: Date;
  }>): Promise<MatchChangedApplyResult>;

  /** Releases the exact lease as FAILED without changing the last READY projection. */
  failClaimedMatchChanged(input: Readonly<{
    event: ClaimedMatchChangedEvent;
    failureCode: string;
    now: Date;
  }>): Promise<void>;
}
