import type { DatabaseExecutor } from "@/platform/db/transaction";

import type { TeamBalanceRatingProviderDto } from "../../domain/team-balance";

export type TeamBalanceRatingSnapshot = Readonly<{
  generation: number | null;
  ratings: ReadonlyMap<string, TeamBalanceRatingProviderDto | null>;
}>;

export interface TeamBalanceRatingProvider {
  load(
    executor: DatabaseExecutor,
    playerIds: readonly string[],
  ): Promise<TeamBalanceRatingSnapshot>;
}
