import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type {
  RiotAuthorizationIntent,
  RiotJobAuthorizationVerifierPort,
} from "../application/ports";
import { verifyJobRequest } from "@/modules/operations/infrastructure/job-signature";
import { jobNonceBindings } from "@/platform/db/schema/operations";
import type { V2Transaction } from "@/platform/db/transaction";

type SignedIntent = Extract<RiotAuthorizationIntent, { kind: "SIGNED_JOB" }>;

function same(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

export class PostgresRiotJobVerifier implements RiotJobAuthorizationVerifierPort<V2Transaction> {
  constructor(private readonly secret: string) {
    if (secret.length < 32 || secret.length > 1_000) throw new Error("INVALID_RIOT_JOB_SECRET");
  }

  async verifyAndConsume(
    transaction: V2Transaction,
    intent: SignedIntent,
    action: "CLAIM_SYNC" | "FINISH_SYNC",
  ): Promise<boolean> {
    const verification = verifyJobRequest({
      request: {
        method: "POST",
        path: "/api/internal/jobs/riot-sync",
        timestampSeconds: intent.timestampSeconds,
        nonce: intent.nonce,
        bodyDigestHex: intent.bodyDigestHex,
        signatureHex: intent.signatureHex,
      },
      secret: this.secret,
      now: new Date(),
      nonceAlreadyUsed: false,
    });
    if (!verification.ok || intent.jobName !== "riot-sync") return false;

    const nonceHash = createHash("sha256")
      .update("klol-v2:riot-job-nonce:r1\0")
      .update(intent.nonce)
      .digest();
    const requestHash = Buffer.from(intent.bodyDigestHex, "hex");
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`riot-sync:${nonceHash.toString("hex")}`}, 0))`);
    const existing = (await transaction.select().from(jobNonceBindings).where(and(
      eq(jobNonceBindings.jobName, "riot-sync"),
      eq(jobNonceBindings.nonceHash, nonceHash),
    )).limit(1))[0];
    const now = new Date();

    if (action === "FINISH_SYNC") {
      return Boolean(existing && existing.expiresAt > now && same(existing.requestHash, requestHash));
    }
    if (existing && existing.expiresAt > now) return false;
    if (existing) await transaction.delete(jobNonceBindings).where(eq(jobNonceBindings.id, existing.id));
    await transaction.insert(jobNonceBindings).values({
      id: randomUUID(),
      jobName: "riot-sync",
      nonceHash,
      requestHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    });
    return true;
  }
}
