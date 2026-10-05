import "server-only";

import { redirect } from "next/navigation";
import type { AuthRole } from "../domain/auth-session";
import { isAdminRole } from "../domain/auth-session";
import { authorizeAccountSession, authorizeSession } from "../application/authorize-session";
import { normalizeAccountNext } from "../application/normalize-internal-next";
import { getCurrentSession } from "./runtime-session";

export async function requirePageRole(requiredRole: AuthRole, nextPath: string) {
  const purpose = requiredRole === "USER" ? "ACCOUNT" : "ADMIN";
  const decision = authorizeSession(await getCurrentSession(purpose), requiredRole);
  if (decision.allowed) return decision.session;

  if (decision.reason === "PASSWORD_CHANGE_REQUIRED") {
    redirect(`/account/password?required=1&next=${encodeURIComponent(normalizeAccountNext(nextPath))}`);
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
  if (session.mustChangePassword) redirect(`/account/password?required=1&next=${encodeURIComponent(normalizeAccountNext(nextPath))}`);
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
