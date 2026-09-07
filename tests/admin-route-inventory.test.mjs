import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LOGIN_PAGE_ROUTE,
  ADMIN_SECURITY_PAGE_CASE,
  PROTECTED_ADMIN_PAGE_CASES,
  discoverCanonicalAdminPageRoutes,
} from "../scripts/auth-http-admin-page-routes.mjs";

function requestPathMatchesCanonicalRoute(canonicalRoute, requestPath) {
  const canonicalSegments = canonicalRoute.split("/").filter(Boolean);
  const requestSegments = requestPath.split("/").filter(Boolean);
  if (canonicalSegments.length !== requestSegments.length) return false;

  return canonicalSegments.every((segment, index) => {
    if (/^\[[^/]+\]$/.test(segment)) return requestSegments[index]?.length > 0;
    return segment === requestSegments[index];
  });
}

test("admin HTTP guard matrix covers every canonical App Router page", async () => {
  const discoveredRoutes = await discoverCanonicalAdminPageRoutes();
  const protectedRoutes = PROTECTED_ADMIN_PAGE_CASES.map(({ canonicalRoute }) => canonicalRoute);
  const protectedRequestPaths = PROTECTED_ADMIN_PAGE_CASES.map(({ requestPath }) => requestPath);

  assert.equal(new Set(protectedRoutes).size, protectedRoutes.length, "canonical guard routes must be unique");
  assert.equal(
    new Set(protectedRequestPaths).size,
    protectedRequestPaths.length,
    "guard request paths must be unique",
  );
  assert.equal(protectedRoutes.includes(ADMIN_LOGIN_PAGE_ROUTE), false, "login is the public exception");
  assert.equal(
    protectedRoutes.includes(ADMIN_SECURITY_PAGE_CASE.canonicalRoute),
    false,
    "TOTP enrollment uses its separate authorization matrix",
  );

  for (const { canonicalRoute, requestPath } of PROTECTED_ADMIN_PAGE_CASES) {
    assert.equal(
      requestPathMatchesCanonicalRoute(canonicalRoute, requestPath),
      true,
      `${requestPath} must exercise ${canonicalRoute}`,
    );
    assert.doesNotMatch(requestPath, /[?#]/, "guard matrix paths must not hide query or fragment state");
  }

  assert.deepEqual(
    discoveredRoutes,
    [...protectedRoutes, ADMIN_LOGIN_PAGE_ROUTE, ADMIN_SECURITY_PAGE_CASE.canonicalRoute].sort(),
  );
});

