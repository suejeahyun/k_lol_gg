import type { V2Transaction } from "@/platform/db/transaction";

import type { MatchActor } from "./match-repository";

export interface MatchTransactionAuthorizer {
  assertAuthorized(transaction: V2Transaction, actor: MatchActor, now: Date): Promise<void>;
}
