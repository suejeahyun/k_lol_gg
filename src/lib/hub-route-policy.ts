/** The hub shares source code, but exposes no child-community product routes. */
const HUB_PAGES = new Set([
  "/", "/community-network", "/admin/community-network", "/admin/login",
  "/admin/security", "/login", "/account/password", "/forbidden",
  "/signup", "/forgot-password", "/terms", "/privacy", "/help/contact",
  "/sites", "/sites/new", "/admin/community-sites", "/admin/users",
  "/admin/operation-forms/suggestions", "/sso/authorize",
]);

const READ_METHODS = ["GET", "HEAD"] as const;
const HUB_API_METHODS: Readonly<Record<string, readonly string[]>> = {
  "/api/admin/community-network": ["GET", "HEAD", "PUT"],
  "/api/admin/login": ["POST"],
  "/api/admin/logout": ["POST"],
  "/api/auth/login": ["POST"],
  "/api/auth/signup": ["POST"],
  "/api/auth/reset-requests": ["POST"],
  "/api/support": ["POST"],
  "/api/auth/logout": ["POST"],
  "/api/auth/me": READ_METHODS,
  "/api/auth/password": ["PATCH"],
  "/api/health": READ_METHODS,
  "/api/community-sites": ["GET", "HEAD", "POST"],
  "/api/admin/community-sites": READ_METHODS,
  "/api/admin/users": READ_METHODS,
  "/api/admin/operation-forms": READ_METHODS,
  "/api/auth/community-sso/authorize": ["POST"],
  "/api/auth/community-sso/exchange": ["POST"],
  "/api/cron/community-sites": READ_METHODS,
};
const HUB_METADATA = new Set(["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]);
const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const HUB_DETAIL_PAGE = new RegExp(`^/(?:sites|admin/community-sites|admin/users)/${UUID_SEGMENT}$`, "u");
const HUB_SITE_API = new RegExp(`^/api/(admin/)?community-sites/${UUID_SEGMENT}$`, "u");
const HUB_USER_API = new RegExp(`^/api/admin/users/${UUID_SEGMENT}(?:/(approve|reject|suspend|reset-pending|restore|role|password-reset|delete|details))?$`, "u");
const HUB_SUPPORT_DETAIL = new RegExp(`^/admin/operation-forms/suggestions/${UUID_SEGMENT}$`, "u");
const HUB_SUPPORT_API = new RegExp(`^/api/admin/operation-forms/suggestions/${UUID_SEGMENT}$`, "u");

export type HubRouteDecision =
  | { kind: "allow" }
  | { kind: "redirect"; destination: string }
  | { kind: "not-found" }
  | { kind: "method-not-allowed"; allow: readonly string[] };

export function isHubNavigationPath(pathname: string): boolean {
  return HUB_PAGES.has(pathname) || HUB_DETAIL_PAGE.test(pathname) || HUB_SUPPORT_DETAIL.test(pathname) || pathname === "/admin" || pathname === "/account";
}

function isCanonicalPath(pathname: string): boolean {
  return pathname.startsWith("/") && !/[\\%?#\u0000-\u0020\u007f]/u.test(pathname)
    && !pathname.includes("//") && !pathname.split("/").some((part) => part === "." || part === "..");
}

export function resolveHubRoute(pathname: string, method: string, development = false): HubRouteDecision {
  if (!isCanonicalPath(pathname)) return { kind: "not-found" };
  const siteApi = HUB_SITE_API.exec(pathname);
  const userApi = HUB_USER_API.exec(pathname);
  const apiMethods = HUB_API_METHODS[pathname]
    ?? (siteApi ? ["GET", "HEAD", "PATCH"] : undefined)
    ?? (userApi ? (userApi[1] === "details" ? READ_METHODS : userApi[1] === "delete" ? ["DELETE"] : userApi[1] ? ["PATCH"] : ["GET", "HEAD", "DELETE"]) : undefined)
    ?? (HUB_SUPPORT_API.test(pathname) ? ["GET", "HEAD", "PATCH", "DELETE"] : undefined);
  if (apiMethods) return apiMethods.includes(method)
    ? { kind: "allow" }
    : { kind: "method-not-allowed", allow: apiMethods };

  const staticAsset = pathname.startsWith("/_next/static/")
    || pathname.startsWith("/icons/hub/")
    || pathname.startsWith("/images/hub/")
    || (development && pathname === "/_next/webpack-hmr");
  if (!isHubNavigationPath(pathname) && !HUB_METADATA.has(pathname) && !staticAsset) return { kind: "not-found" };
  if (!(READ_METHODS as readonly string[]).includes(method)) return { kind: "method-not-allowed", allow: READ_METHODS };
  if (pathname === "/admin") return { kind: "redirect", destination: "/admin/community-network" };
  if (pathname === "/account") return { kind: "redirect", destination: "/" };
  return { kind: "allow" };
}
