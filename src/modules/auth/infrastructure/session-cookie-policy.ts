import { SESSION_MAX_AGE_SECONDS } from "./session-constants";

export function sessionCookieOptions(secureTransport: boolean, nodeEnv = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    secure: nodeEnv === "production" || secureTransport,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}

export function clearedSessionCookieOptions(
  secureTransport: boolean,
  nodeEnv = process.env.NODE_ENV,
) {
  return { ...sessionCookieOptions(secureTransport, nodeEnv), maxAge: 0 };
}
