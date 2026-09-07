import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { TransactionSessionActor } from "../domain/transaction-session";
import type { AuthRole, AuthSessionAccountStatus, AuthSessionPurpose } from "../domain/auth-session";
import { authSessions, userAccounts } from "@/platform/db/schema/auth";
import type { V2Transaction } from "@/platform/db/transaction";

const roleRank: Record<AuthRole, number> = {
  USER: 0,
  ADMIN: 1,
  SUPER_ADMIN: 2,
};

export type TransactionSessionPolicy = Readonly<{
  purpose: AuthSessionPurpose;
  minimumRole: AuthRole;
  allowedStatuses: readonly AuthSessionAccountStatus[];
  allowMustChangePassword: boolean;
  adminTotp: "REQUIRED" | "OPTIONAL";
}>;

export type LockedTransactionAccount = Readonly<{
  id: string;
  role: AuthRole;
  status: AuthSessionAccountStatus;
  authVersion: number;
  revision: number;
  mustChangePassword: boolean;
}>;

/**
 * Lock order is deliberately account -> session -> domain rows.  Every
 * mutation repository calls this before receipt replay or domain locks so a
 * concurrent role/status/password/TOTP/revocation change cannot authorize a
 * stale command.
 */
export async function lockTransactionSessionActor(
  transaction: V2Transaction,
  actor: TransactionSessionActor,
  _requestTime: Date,
  policy: TransactionSessionPolicy,
): Promise<LockedTransactionAccount | null> {
  const account = (
    await transaction
      .select({
        id: userAccounts.id,
        role: userAccounts.role,
        status: userAccounts.status,
        authVersion: userAccounts.authVersion,
        revision: userAccounts.revision,
        mustChangePassword: userAccounts.mustChangePassword,
        deletedAt: userAccounts.deletedAt,
      })
      .from(userAccounts)
      .where(eq(userAccounts.id, actor.userAccountId))
      .for("update")
      .limit(1)
  )[0];

  if (
    !account ||
    account.deletedAt !== null ||
    account.role !== actor.role ||
    account.authVersion !== actor.authVersion ||
    roleRank[account.role] < roleRank[policy.minimumRole] ||
    !policy.allowedStatuses.includes(account.status) ||
    (!policy.allowMustChangePassword && account.mustChangePassword)
  ) {
    return null;
  }

  const session = (
    await transaction
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.id, actor.sessionId),
          eq(authSessions.userAccountId, account.id),
          eq(authSessions.authVersion, account.authVersion),
          eq(authSessions.role, account.role),
          eq(authSessions.purpose, policy.purpose),
          eq(authSessions.kind, "USER"),
          isNull(authSessions.revokedAt),
          // clock_timestamp() is evaluated after any row-lock wait. PostgreSQL
          // transaction timestamps would let a session that expired while
          // queued authorize a mutation.
          sql<boolean>`${authSessions.expiresAt} > clock_timestamp()`,
          policy.purpose === "ACCOUNT"
            ? isNull(authSessions.totpVerifiedAt)
            : policy.adminTotp === "REQUIRED"
              ? isNotNull(authSessions.totpVerifiedAt)
              : undefined,
        ),
      )
      .for("update")
      .limit(1)
  )[0];

  return session
    ? {
        id: account.id,
        role: account.role,
        status: account.status,
        authVersion: account.authVersion,
        revision: account.revision,
        mustChangePassword: account.mustChangePassword,
      }
    : null;
}

export const ADMIN_MUTATION_SESSION_POLICY: TransactionSessionPolicy = {
  purpose: "ADMIN",
  minimumRole: "ADMIN",
  allowedStatuses: ["APPROVED"],
  allowMustChangePassword: false,
  adminTotp: "REQUIRED",
};

export const APPROVED_ACCOUNT_MUTATION_SESSION_POLICY: TransactionSessionPolicy = {
  purpose: "ACCOUNT",
  minimumRole: "USER",
  allowedStatuses: ["APPROVED"],
  allowMustChangePassword: false,
  adminTotp: "OPTIONAL",
};

export const SELF_PASSWORD_SESSION_POLICY: TransactionSessionPolicy = {
  purpose: "ACCOUNT",
  minimumRole: "USER",
  allowedStatuses: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
  allowMustChangePassword: true,
  adminTotp: "OPTIONAL",
};
