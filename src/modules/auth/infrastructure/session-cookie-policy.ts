import { sessionMaximumAgeSeconds } from "./session-constants";

export function sessionCookieOptions(
  secureTransport: boolean,
  nodeEnv: string | undefined,
  purpose: "ACCOUNT" | "ADMIN",
) {
  return {
    httpOnly: true,
    secure: nodeEnv === "production" || secureTransport,
    sameSite: "strict" as const,
    path: "/",
    maxAge: sessionMaximumAgeSeconds(purpose),
    priority: "high" as const,
  };
}

export function clearedSessionCookieOptions(
  secureTransport: boolean,
  nodeEnv: string | undefined,
  purpose: "ACCOUNT" | "ADMIN",
) {
  return { ...sessionCookieOptions(secureTransport, nodeEnv, purpose), maxAge: 0 };
}
