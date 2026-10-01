import { and, eq, isNull, sql } from "drizzle-orm";

import { authSessions, userAccounts } from "@/platform/db/schema/auth";
import type { V2Transaction } from "@/platform/db/transaction";

import type { MatchTransactionAuthorizer } from "../application/ports/match-transaction-authorizer";
import type { MatchActor } from "../application/ports/match-repository";
import { MatchServiceError } from "../domain/match";

export class PostgresMatchTransactionAuthorizer implements MatchTransactionAuthorizer {
  async assertAuthorized(transaction: V2Transaction, actor: MatchActor, _now: Date) {
    if (
      (actor.purpose === "ACCOUNT" && actor.requiredRole !== "USER") ||
      (actor.purpose === "ADMIN" && actor.requiredRole !== "ADMIN")
    ) {
      throw new MatchServiceError("FORBIDDEN", "세션 목적과 작업 권한이 일치하지 않습니다.");
    }
    const account = (
      await transaction
        .select({
          id: userAccounts.id,
          role: userAccounts.role,
          status: userAccounts.status,
          authVersion: userAccounts.authVersion,
          deletedAt: userAccounts.deletedAt,
          mustChangePassword: userAccounts.mustChangePassword,
        })
        .from(userAccounts)
        .where(and(eq(userAccounts.id, actor.userAccountId), isNull(userAccounts.deletedAt)))
        .for("share")
        .limit(1)
    )[0];
    if (!account || account.status !== "APPROVED" || account.mustChangePassword) {
      throw new MatchServiceError("SESSION_CHANGED", "승인된 현재 계정을 확인할 수 없습니다.");
    }
    if (
      actor.requiredRole === "ADMIN" &&
      account.role !== "ADMIN" &&
      account.role !== "SUPER_ADMIN"
    ) {
      throw new MatchServiceError("FORBIDDEN", "관리자 역할이 필요합니다.");
    }

    const session = (
      await transaction
        .select({
          userAccountId: authSessions.userAccountId,
          authVersion: authSessions.authVersion,
          role: authSessions.role,
        })
        .from(authSessions)
        .where(
          and(
            eq(authSessions.id, actor.sessionId),
            eq(authSessions.userAccountId, actor.userAccountId),
            eq(authSessions.purpose, actor.purpose),
            eq(authSessions.kind, "USER"),
            isNull(authSessions.revokedAt),
            sql<boolean>`${authSessions.expiresAt} > clock_timestamp()`,
          ),
        )
        .for("share")
        .limit(1)
    )[0];
    if (
      !session ||
      session.authVersion !== account.authVersion ||
      session.role !== account.role
    ) {
      throw new MatchServiceError("SESSION_CHANGED", "세션 권한이 변경되었습니다.");
    }
  }
}
