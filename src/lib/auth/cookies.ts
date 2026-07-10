import { authConstants } from "@/lib/auth";

export const USER_TOKEN_COOKIE = "user_token";

export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

export function clearAuthCookieOptions() {
  return {
    ...authCookieOptions(0),
    expires: new Date(0),
  };
}

export function getAuthCookieNames() {
  return {
    userToken: USER_TOKEN_COOKIE,
    legacyAdminToken: authConstants.ADMIN_TOKEN_KEY,
  };
}
