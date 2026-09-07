import type { AuthRole, AuthSession } from "../domain/auth-session";
import { isAdminRole } from "../domain/auth-session";

const ROLE_RANK: Record<AuthRole, number> = {
  USER: 0,
  ADMIN: 1,
  SUPER_ADMIN: 2,
};

export type AuthorizationDecision =
  | { allowed: true; session: AuthSession }
  | {
      allowed: false;
      reason:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "TOTP_REQUIRED"
        | "PASSWORD_CHANGE_REQUIRED";
    };

export function authorizeSession(
  session: AuthSession | null,
  requiredRole: AuthRole,
): AuthorizationDecision {
  if (!session) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  if (requiredRole === "USER") {
    if (session.purpose !== "ACCOUNT" || session.accountStatus !== "APPROVED") {
      return { allowed: false, reason: "FORBIDDEN" };
    }
  } else if (session.purpose !== "ADMIN" || session.accountStatus !== "APPROVED") {
    return { allowed: false, reason: "FORBIDDEN" };
  }

  if (session.mustChangePassword) {
    return { allowed: false, reason: "PASSWORD_CHANGE_REQUIRED" };
  }

  if (ROLE_RANK[session.role] < ROLE_RANK[requiredRole]) {
    return { allowed: false, reason: "FORBIDDEN" };
  }

  if (isAdminRole(requiredRole) && !session.adminTotpVerified) {
    return { allowed: false, reason: "TOTP_REQUIRED" };
  }

  return { allowed: true, session };
}

export type AccountSessionDecision =
  | { allowed: true; session: AuthSession }
  | { allowed: false; reason: "UNAUTHENTICATED" | "WRONG_PURPOSE" };

export function authorizeAccountSession(session: AuthSession | null): AccountSessionDecision {
  if (!session) return { allowed: false, reason: "UNAUTHENTICATED" };
  if (session.purpose !== "ACCOUNT") return { allowed: false, reason: "WRONG_PURPOSE" };
  return { allowed: true, session };
}
