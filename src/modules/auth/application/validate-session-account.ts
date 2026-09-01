import type { AuthAccount } from "../domain/auth-account";
import type { AuthSession } from "../domain/auth-session";
import { isAdminRole } from "../domain/auth-session";

export function sessionMatchesAccount(session: AuthSession, account: AuthAccount | null) {
  if (!account || account.status !== "APPROVED") return false;
  if (session.userId !== account.id) return false;
  if (session.role !== account.role) return false;
  if (session.authVersion !== account.authVersion) return false;

  if (isAdminRole(account.role)) {
    if (session.adminTotpVerified && !account.adminTotpEnabled) return false;
  } else if (session.adminTotpVerified) {
    return false;
  }

  return true;
}
