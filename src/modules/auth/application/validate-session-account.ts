import type { AuthAccount } from "../domain/auth-account";
import type { AuthSession } from "../domain/auth-session";
import { isAdminRole } from "../domain/auth-session";

export function sessionMatchesAccount(session: AuthSession, account: AuthAccount | null) {
  if (!account) return false;
  if (session.userId !== account.id) return false;
  if (session.role !== account.role) return false;
  if (session.accountStatus !== account.status) return false;
  if (session.mustChangePassword !== account.mustChangePassword) return false;
  if (session.authVersion !== account.authVersion) return false;

  if (session.purpose === "ADMIN") {
    if (account.status !== "APPROVED" || !isAdminRole(account.role)) return false;
    if (session.adminTotpVerified && !account.adminTotpEnabled) return false;
  } else {
    if (session.adminTotpVerified) return false;
  }

  return true;
}
