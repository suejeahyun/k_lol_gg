import "server-only";

import { redirect } from "next/navigation";
import type { AuthRole } from "../domain/auth-session";
import { isAdminRole } from "../domain/auth-session";
import { authorizeSession } from "../application/authorize-session";
import { getCurrentSession } from "./runtime-session";

export async function requirePageRole(requiredRole: AuthRole, nextPath: string) {
  const decision = authorizeSession(await getCurrentSession(), requiredRole);
  if (decision.allowed) return decision.session;

  if (decision.reason === "TOTP_REQUIRED") {
    redirect(`/admin/security?setup=required&next=${encodeURIComponent(nextPath)}`);
  }

  if (decision.reason === "UNAUTHENTICATED") {
    redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }

  redirect("/forbidden");
}

export async function authorizeApiRole(requiredRole: AuthRole) {
  return authorizeSession(await getCurrentSession(), requiredRole);
}

export async function requireAdminEnrollmentPage(nextPath: string) {
  const session = await getCurrentSession();
  if (!session) redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  if (!isAdminRole(session.role)) redirect("/forbidden");
  return session;
}
