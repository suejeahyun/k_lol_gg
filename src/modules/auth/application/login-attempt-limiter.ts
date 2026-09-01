import { createHash } from "node:crypto";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export class LoginAttemptLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(clientKey: string, loginId: string): RateLimitDecision {
    const now = this.now();
    const clientHash = hashKey(clientKey);
    const loginHash = hashKey(loginId.trim().normalize("NFKC").toLowerCase() || "<blank>");
    const rules: RateLimitRule[] = [
      { key: "global", limit: 80, windowMs: 60_000 },
      { key: `client:${clientHash}`, limit: 20, windowMs: 5 * 60_000 },
      { key: `login:${loginHash}`, limit: 8, windowMs: 5 * 60_000 },
    ];

    let longestWait = 0;
    for (const rule of rules) {
      const bucket = this.buckets.get(rule.key);
      if (bucket && bucket.resetAt > now && bucket.count >= rule.limit) {
        longestWait = Math.max(longestWait, bucket.resetAt - now);
      }
    }

    if (longestWait > 0) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(longestWait / 1000)) };
    }

    for (const rule of rules) {
      const existing = this.buckets.get(rule.key);
      if (!existing || existing.resetAt <= now) {
        this.buckets.set(rule.key, { count: 1, resetAt: now + rule.windowMs });
      } else {
        existing.count += 1;
      }
    }

    if (this.buckets.size > 1_024) this.removeExpired(now);
    return { allowed: true };
  }

  private removeExpired(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export class LoginWorkGate {
  private active = 0;

  constructor(private readonly maximumConcurrent = 4) {}

  acquire(): (() => void) | null {
    if (this.active >= this.maximumConcurrent) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
    };
  }
}

function hashKey(value: string) {
  return createHash("sha256").update(value.slice(0, 256)).digest("base64url").slice(0, 22);
}
