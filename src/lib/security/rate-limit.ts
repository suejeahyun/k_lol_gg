import { NextRequest, NextResponse } from "next/server";

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

function getPolicy(pathname: string, method: string): RateLimitPolicy | null {
  if (!pathname.startsWith("/api/")) return null;

  if (pathname === "/api/admin/login" || pathname === "/api/auth/login") {
    return { name: "login", windowMs: 10 * 60_000, max: 10 };
  }

  if (pathname === "/api/auth/signup" || pathname === "/api/auth/password/forgot") {
    return { name: "account-create-recover", windowMs: 60 * 60_000, max: 5 };
  }

  if (pathname.startsWith("/api/admin/")) {
    return { name: "admin-api", windowMs: 60_000, max: 120 };
  }

  if (pathname.startsWith("/api/discord/") || pathname.startsWith("/api/kakao/")) {
    return { name: "bot-api", windowMs: 60_000, max: 240 };
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
  const policy = getPolicy(request.nextUrl.pathname, request.method);
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
