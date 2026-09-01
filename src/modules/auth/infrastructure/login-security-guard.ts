import "server-only";

import type { NextRequest } from "next/server";
import { LoginAttemptLimiter, LoginWorkGate } from "../application/login-attempt-limiter";

function requestClientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  return (direct || forwarded || "unknown-client").slice(0, 128);
}

const limiter = new LoginAttemptLimiter();
const workGate = new LoginWorkGate();

export function guardAdminLoginAttempt(request: NextRequest, loginId: string) {
  return limiter.consume(requestClientKey(request), loginId);
}

export function acquireAdminLoginWork() {
  return workGate.acquire();
}
