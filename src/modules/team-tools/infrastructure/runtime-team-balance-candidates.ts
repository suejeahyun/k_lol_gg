import "server-only";

import { getDatabase } from "@/platform/db/client";

import { PostgresTeamBalanceCandidateRepository } from "./postgres-team-balance-candidate-repository";

export function getRuntimeTeamBalanceCandidateRepository() {
  try {
    return new PostgresTeamBalanceCandidateRepository(getDatabase());
  } catch {
    return null;
  }
}
