import "server-only";

import { redirect } from "next/navigation";
import type { AuthRole } from "../domain/auth-session";
import { isAdminRole } from "../domain/auth-session";
import { authorizeAccountSession, authorizeSession } from "../application/authorize-session";
import { getCurrentSession } from "./runtime-session";

export async function requirePageRole(requiredRole: AuthRole, nextPath: string) {
  const purpose = requiredRole === "USER" ? "ACCOUNT" : "ADMIN";
  const decision = authorizeSession(await getCurrentSession(purpose), requiredRole);
  if (decision.allowed) return decision.session;

  if (decision.reason === "TOTP_REQUIRED") {
    redirect(`/admin/security?setup=required&next=${encodeURIComponent(nextPath)}`);
  }

  if (decision.reason === "PASSWORD_CHANGE_REQUIRED") {
    redirect("/account/password?required=1");
  }

  if (decision.reason === "UNAUTHENTICATED") {
    redirect(
      requiredRole === "USER"
        ? `/login?next=${encodeURIComponent(nextPath)}`
        : `/admin/login?next=${encodeURIComponent(nextPath)}`,
    );
  }

  redirect("/forbidden");
}

export async function authorizeApiRole(requiredRole: AuthRole) {
  const purpose = requiredRole === "USER" ? "ACCOUNT" : "ADMIN";
  return authorizeSession(await getCurrentSession(purpose), requiredRole);
}

export async function requireAccountPage(nextPath: string) {
  const decision = authorizeAccountSession(await getCurrentSession("ACCOUNT"));
  if (decision.allowed) return decision.session;
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function requireApprovedAccountPage(nextPath: string) {
  const session = await requireAccountPage(nextPath);
  if (session.accountStatus !== "APPROVED") redirect("/account");
  if (session.mustChangePassword) redirect("/account/password?required=1");
  return session;
}

export async function requireAdminEnrollmentPage(nextPath: string) {
  const session = await getCurrentSession("ADMIN");
  if (!session) redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  if (!isAdminRole(session.role)) redirect("/forbidden");
  if (session.purpose !== "ADMIN" || session.accountStatus !== "APPROVED") redirect("/forbidden");
  if (session.mustChangePassword) redirect("/account/password?required=1");
  return session;
}
