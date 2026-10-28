import type { AuthSession } from "@/modules/auth/domain/auth-session";

const previewReadPaths = new Set(["/login", "/admin/login", "/terms", "/privacy", "/icons/hub/mark.svg", "/api/auth/me", "/api/health", "/api/community-runtime", "/api/auth/community-sso/start", "/api/auth/community-sso/callback"]);
const previewPostPaths = new Set(["/api/auth/login", "/api/admin/login", "/api/auth/logout", "/api/admin/logout"]);

/** Only the authentication backbone and immutable application assets are public before activation. */
export function isPublicCommunityPreviewRequest(pathname: string, method: string, development = false) {
  if (/[\\%?#\u0000-\u0020\u007f]/u.test(pathname) || pathname.includes("//")) return false;
  if (method === "GET" || method === "HEAD") return previewReadPaths.has(pathname)
    || pathname.startsWith("/_next/static/")
    || (development && pathname === "/_next/webpack-hmr");
  return method === "POST" && previewPostPaths.has(pathname);
}

export function mayAccessCommunityPreview(ownerUserAccountId: string, session: AuthSession | null) {
  return session?.source === "database" && session.userId === ownerUserAccountId
    && session.role === "SUPER_ADMIN" && session.accountStatus === "APPROVED";
}
