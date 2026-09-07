import "server-only";

import { isAdminRole, type AuthSession } from "../domain/auth-session";
import { getCurrentSession } from "./runtime-session";

export type AdminSecurityAuthorization =
  | Readonly<{ allowed: true; session: AuthSession }>
  | Readonly<{
      allowed: false;
      reason: "ADMIN_REQUIRED" | "SESSION_REQUIRED" | "VERIFIED_TOTP_REQUIRED";
    }>;

export async function authorizeAdminSecuritySession(
  options: { requireVerifiedTotp?: boolean } = {},
): Promise<AdminSecurityAuthorization> {
  const session = await getCurrentSession("ADMIN");
  if (!session) return { allowed: false, reason: "SESSION_REQUIRED" };
  if (!isAdminRole(session.role)) return { allowed: false, reason: "ADMIN_REQUIRED" };
  if (options.requireVerifiedTotp && !session.adminTotpVerified) {
    return { allowed: false, reason: "VERIFIED_TOTP_REQUIRED" };
  }
  return { allowed: true, session };
}
