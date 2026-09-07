import type { AuthRole, AuthSession } from "./auth-session";

/**
 * The immutable session identity that a mutation must re-authorize inside the
 * same database transaction as its domain writes.  Values come from a
 * verified runtime session, but are never trusted without the row locks in
 * lockTransactionSessionActor.
 */
export type TransactionSessionActor = Readonly<{
  userAccountId: string;
  sessionId: string;
  role: AuthRole;
  authVersion: number;
}>;

export function transactionSessionActor(session: AuthSession): TransactionSessionActor {
  return {
    userAccountId: session.userId,
    sessionId: session.sessionId,
    role: session.role,
    authVersion: session.authVersion,
  };
}
