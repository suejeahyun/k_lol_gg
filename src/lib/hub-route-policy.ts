/** The hub shares source code, but exposes no child-community product routes. */
const HUB_PAGES = new Set([
  "/", "/community-network", "/admin/community-network", "/admin/login",
  "/admin/security", "/login", "/account/password", "/forbidden",
]);

const READ_METHODS = ["GET", "HEAD"] as const;
const HUB_API_METHODS: Readonly<Record<string, readonly string[]>> = {
  "/api/admin/community-network": ["GET", "HEAD", "PUT"],
  "/api/admin/login": ["POST"],
  "/api/admin/logout": ["POST"],
  "/api/auth/login": ["POST"],
  "/api/auth/logout": ["POST"],
  "/api/auth/me": READ_METHODS,
  "/api/auth/password": ["PATCH"],
  "/api/health": READ_METHODS,
};
const HUB_METADATA = new Set(["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]);

export type HubRouteDecision =
  | { kind: "allow" }
  | { kind: "redirect"; destination: string }
  | { kind: "not-found" }
  | { kind: "method-not-allowed"; allow: readonly string[] };

export function isHubNavigationPath(pathname: string): boolean {
  return HUB_PAGES.has(pathname) || pathname === "/admin" || pathname === "/account";
}

function isCanonicalPath(pathname: string): boolean {
  return pathname.startsWith("/") && !/[\\%?#\u0000-\u0020\u007f]/u.test(pathname)
    && !pathname.includes("//") && !pathname.split("/").some((part) => part === "." || part === "..");
}

export function resolveHubRoute(pathname: string, method: string, development = false): HubRouteDecision {
  if (!isCanonicalPath(pathname)) return { kind: "not-found" };
  const apiMethods = HUB_API_METHODS[pathname];
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
