import { NextRequest, NextResponse } from "next/server";
import {
  getRequiredHeaderSecret,
  hasValidServerSecret,
} from "@/lib/security/request-guard";

type RateLimitPolicy = {
  name: string;
  windowMs: number;
  max: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanupAt = 0;

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

function isMutation(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function hasValidConfiguredServerSecret(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return Boolean(
    getRequiredHeaderSecret(pathname) &&
      hasValidServerSecret(request, pathname),
  );
}

function getPolicy(pathname: string, method: string, request: NextRequest): RateLimitPolicy | null {
  if (!pathname.startsWith("/api/")) return null;

  // Browser login: strict enough for attack resistance, but not too aggressive during 2FA entry.
  if (pathname === "/api/admin/login" || pathname === "/api/auth/login") {
    return { name: "login", windowMs: 5 * 60_000, max: 12 };
  }

  // 2FA setup/status is frequently retried while an admin is registering an authenticator app.
  if (pathname.startsWith("/api/admin/2fa/")) {
    if (pathname.endsWith("/enable") || pathname.endsWith("/disable")) {
      return { name: "admin-2fa-mutation", windowMs: 5 * 60_000, max: 20 };
    }

    return { name: "admin-2fa-read", windowMs: 60_000, max: 180 };
  }

  if (pathname === "/api/auth/signup" || pathname === "/api/auth/password/forgot") {
    return { name: "account-create-recover", windowMs: 60 * 60_000, max: 5 };
  }

  // Bot calls can be frequent. They are already protected by header secret, so allow higher throughput.
  if (pathname.startsWith("/api/kakao/")) {
    return hasValidConfiguredServerSecret(request)
      ? { name: "trusted-bot-api", windowMs: 60_000, max: 900 }
      : { name: "bot-api", windowMs: 60_000, max: 120 };
  }

  // Admin pages poll lists/details more often. Mutations remain lower than reads.
  if (pathname.startsWith("/api/admin/")) {
    return isMutation(method)
      ? { name: "admin-api-mutation", windowMs: 60_000, max: 120 }
      : { name: "admin-api-read", windowMs: 60_000, max: 300 };
  }

  if (pathname.startsWith("/api/participation/")) {
    return { name: "participation", windowMs: 60_000, max: 30 };
  }

  if (pathname.includes("/search") || pathname.startsWith("/api/players")) {
    return { name: "search", windowMs: 60_000, max: 120 };
  }

  if (isMutation(method)) {
    return { name: "mutation", windowMs: 60_000, max: 60 };
  }

  return { name: "read-api", windowMs: 60_000, max: 300 };
}

function cleanup(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rejectIfRateLimited(request: NextRequest) {
  const policy = getPolicy(request.nextUrl.pathname, request.method, request);
  if (!policy) return null;

  const now = Date.now();
  cleanup(now);

  const ip = getClientIp(request);
  const key = `${policy.name}:${ip}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return null;
  }

  current.count += 1;

  if (current.count <= policy.max) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return NextResponse.json(
    {
      ok: false,
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      limit: policy.max,
      windowSeconds: Math.ceil(policy.windowMs / 1000),
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(policy.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(current.resetAt / 1000)),
      },
    },
  );
}
