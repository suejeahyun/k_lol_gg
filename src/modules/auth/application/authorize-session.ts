import type { AuthRole, AuthSession } from "../domain/auth-session";
import { isAdminRole } from "../domain/auth-session";

const ROLE_RANK: Record<AuthRole, number> = {
  USER: 0,
  ADMIN: 1,
  SUPER_ADMIN: 2,
};

export type AuthorizationDecision =
  | { allowed: true; session: AuthSession }
  | { allowed: false; reason: "UNAUTHENTICATED" | "FORBIDDEN" | "TOTP_REQUIRED" };

export function authorizeSession(
  session: AuthSession | null,
  requiredRole: AuthRole,
): AuthorizationDecision {
  if (!session) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  if (ROLE_RANK[session.role] < ROLE_RANK[requiredRole]) {
    return { allowed: false, reason: "FORBIDDEN" };
  }

  if (isAdminRole(requiredRole) && !session.adminTotpVerified) {
    return { allowed: false, reason: "TOTP_REQUIRED" };
  }

  return { allowed: true, session };
}
