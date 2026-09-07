import type { PoolClient } from "pg";

export type CutoverClient = Pick<PoolClient, "query">;

export type CutoverStepResult = Readonly<{
  name: string;
  sourceCount: number;
  targetCount: number;
  insertedCount: number;
}>;

export type CutoverPhase = (
  client: CutoverClient,
) => Promise<readonly CutoverStepResult[]>;
