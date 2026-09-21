import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, inArray, lt, lte, ne, or } from "drizzle-orm";
import type { V2Database } from "@/platform/db/database";
import type { V2Transaction } from "@/platform/db/transaction";
import { kakaoSiteNotices } from "@/platform/db/schema/kakao-site-notices";
import { recruitingNonceBindings } from "@/platform/db/schema/recruiting";
import { seasonApplications, seasonInhouseRounds, seasonKakaoPendingApplications } from "@/platform/db/schema/seasons";
import { INHOUSE_DISCORD_WAIT_NOTICE } from "../domain/inhouse-enrollment";
import { inhouseApplicationScope, inhousePendingScope } from "../infrastructure/inhouse-roster-scope";
import { siteNoticeConfig, siteNoticeExpiry, SITE_NOTICE_LEASE_MS, SITE_NOTICE_MAX_ATTEMPTS, SITE_NOTICE_RETENTION_MS,
  type SiteNoticeConfig, type SiteNoticeRequest } from "./domain";

const digest = (value: string) => createHash("sha256").update(value).digest();
const active = ["PENDING", "LEASED"];

/** Bounded batches, callable from signed daily-close even when phones are offline. */
export async function pruneSiteNotices(tx: V2Transaction, now: Date) {
  const expired = await tx.select({ id: kakaoSiteNotices.id }).from(kakaoSiteNotices)
    .where(and(inArray(kakaoSiteNotices.status, active), lte(kakaoSiteNotices.expiresAt, now)))
    .orderBy(asc(kakaoSiteNotices.expiresAt)).limit(500).for("update", { skipLocked: true });
  if (expired.length) await tx.update(kakaoSiteNotices).set({ status: "EXPIRED", leaseUntil: null, failureCode: "EXPIRED" })
    .where(inArray(kakaoSiteNotices.id, expired.map((row) => row.id)));
  const retired = await tx.select({ id: kakaoSiteNotices.id }).from(kakaoSiteNotices)
    .where(and(inArray(kakaoSiteNotices.status, ["DELIVERED", "FAILED", "EXPIRED"]),
      lt(kakaoSiteNotices.expiresAt, new Date(now.getTime() - SITE_NOTICE_RETENTION_MS))))
    .orderBy(asc(kakaoSiteNotices.expiresAt)).limit(500).for("update", { skipLocked: true });
  if (retired.length) await tx.delete(kakaoSiteNotices).where(inArray(kakaoSiteNotices.id, retired.map((row) => row.id)));
  return { siteNoticesExpired: expired.length, siteNoticesRetired: retired.length };
}

/** Called only on a successful <10 ->10 transition, inside the application transaction. */
export async function enqueueSiteInhouseNotice(transaction: V2Transaction, input: {
  round: typeof seasonInhouseRounds.$inferSelect;
  applicationId: string;
  applicationRevision: number;
  now: Date;
}, config: SiteNoticeConfig | null = siteNoticeConfig()) {
  if (!config || !input.round.sourceRoomIdHash.equals(config.sourceRoomIdHash)) return;
  const expiresAt = siteNoticeExpiry(input.round.applyDate, input.now);
  if (expiresAt <= input.now) return;
  const inserted = await transaction.insert(kakaoSiteNotices).values({
    id: randomUUID(), eventKey: `${input.applicationId}:${input.applicationRevision}`,
    roundId: input.round.id, sourceRoomIdHash: input.round.sourceRoomIdHash, targetHash: config.targetHash,
    availableAt: input.now, expiresAt, createdAt: input.now,
  }).onConflictDoNothing({ target: kakaoSiteNotices.eventKey }).returning({ id: kakaoSiteNotices.id });
  if (!inserted[0]) return;
  // A newer capacity transition supersedes any unsent old transition for this round.
  await transaction.update(kakaoSiteNotices).set({ status: "EXPIRED", leaseUntil: null, failureCode: "SUPERSEDED" })
    .where(and(eq(kakaoSiteNotices.roundId, input.round.id), ne(kakaoSiteNotices.id, inserted[0].id), inArray(kakaoSiteNotices.status, active)));
}

export class SiteNoticeReplayError extends Error {}
export class SiteNoticeLeaseError extends Error {}

export class PostgresSiteNoticeRepository {
  constructor(private readonly database: V2Database) {}

  async execute(request: SiteNoticeRequest, config: SiteNoticeConfig, keyId: string, rawDigest: Buffer, now: Date) {
    return this.database.transaction(async (tx) => {
      const principal = `site-notice:${config.installationId}`;
      await tx.delete(recruitingNonceBindings).where(and(eq(recruitingNonceBindings.actorPrincipalId, principal), lt(recruitingNonceBindings.expiresAt, now)));
      const nonce = await tx.insert(recruitingNonceBindings).values({
        id: randomUUID(), actorKind: "BOT", actorPrincipalId: principal, nonceHash: digest(request.nonce),
        bindingHash: rawDigest, keyId, createdAt: now, expiresAt: new Date(now.getTime() + 600_000),
      }).onConflictDoNothing().returning({ id: recruitingNonceBindings.id });
      if (!nonce[0]) throw new SiteNoticeReplayError("NONCE_REPLAYED");

      await pruneSiteNotices(tx, now);
      if (request.action === "REGISTER") return { registered: true, pollAfterMs: 30_000 };

      const scope = and(eq(kakaoSiteNotices.sourceRoomIdHash, config.sourceRoomIdHash), eq(kakaoSiteNotices.targetHash, config.targetHash));
      if (request.action === "ACK") {
        const [row] = await tx.select().from(kakaoSiteNotices).where(and(scope, eq(kakaoSiteNotices.id, request.eventId!))).for("update");
        if (!row || !row.leaseTokenHash?.equals(digest(request.leaseToken!))) throw new SiteNoticeLeaseError("LEASE_INVALID");
        if (row.status === "DELIVERED" && request.outcome === "SENT") return { acknowledged: true };
        if (row.status === "FAILED" && request.outcome === "UNCERTAIN") return { acknowledged: true };
        if (row.status !== "LEASED" || !row.leaseUntil || row.leaseUntil < now) throw new SiteNoticeLeaseError("LEASE_EXPIRED");
        const retry = request.outcome === "RETRY" && row.attempts < SITE_NOTICE_MAX_ATTEMPTS;
        await tx.update(kakaoSiteNotices).set({
          status: request.outcome === "SENT" ? "DELIVERED" : retry ? "PENDING" : "FAILED",
          deliveredAt: request.outcome === "SENT" ? now : null, leaseUntil: null,
          availableAt: new Date(now.getTime() + Math.min(900_000, 30_000 * 2 ** Math.min(row.attempts, 5))),
          failureCode: request.outcome === "SENT" ? null : request.outcome === "UNCERTAIN" ? "SEND_UNCERTAIN" : "SESSION_UNAVAILABLE",
        }).where(eq(kakaoSiteNotices.id, row.id));
        return { acknowledged: true };
      }

      const rows = await tx.select().from(kakaoSiteNotices).where(and(scope, gt(kakaoSiteNotices.expiresAt, now),
        lte(kakaoSiteNotices.availableAt, now), or(eq(kakaoSiteNotices.status, "PENDING"),
          and(eq(kakaoSiteNotices.status, "LEASED"), lte(kakaoSiteNotices.leaseUntil, now)))))
        .orderBy(asc(kakaoSiteNotices.createdAt)).limit(10).for("update", { skipLocked: true });
      for (const row of rows) {
        if (row.attempts >= SITE_NOTICE_MAX_ATTEMPTS) {
          await tx.update(kakaoSiteNotices).set({ status: "FAILED", leaseUntil: null, failureCode: "ATTEMPTS_EXHAUSTED" }).where(eq(kakaoSiteNotices.id, row.id));
          continue;
        }
        const [round] = await tx.select().from(seasonInhouseRounds).where(eq(seasonInhouseRounds.id, row.roundId));
        if (!round || round.status !== "IN_PROGRESS") {
          await tx.update(kakaoSiteNotices).set({ status: "EXPIRED", leaseUntil: null, failureCode: "ROUND_CLOSED" }).where(eq(kakaoSiteNotices.id, row.id));
          continue;
        }
        const [members, pending] = await Promise.all([
          tx.select({ total: count() }).from(seasonApplications).where(and(eq(seasonApplications.seasonId, round.seasonId),
            eq(seasonApplications.applyDate, round.applyDate), eq(seasonApplications.recruitNo, round.recruitNo),
            inhouseApplicationScope(round),
            inArray(seasonApplications.status, ["APPLIED", "CONFIRMED"]))),
          tx.select({ total: count() }).from(seasonKakaoPendingApplications).where(and(eq(seasonKakaoPendingApplications.seasonId, round.seasonId),
            eq(seasonKakaoPendingApplications.applyDate, round.applyDate), eq(seasonKakaoPendingApplications.recruitNo, round.recruitNo),
            inhousePendingScope(round), eq(seasonKakaoPendingApplications.status, "ACTIVE"),
            eq(seasonKakaoPendingApplications.reserve, false))),
        ]);
        if (Number(members[0]?.total) + Number(pending[0]?.total) < round.capacity) {
          await tx.update(kakaoSiteNotices).set({ status: "EXPIRED", leaseUntil: null, failureCode: "NO_LONGER_FULL" }).where(eq(kakaoSiteNotices.id, row.id));
          continue;
        }
        const leaseToken = randomBytes(32).toString("hex");
        const leaseUntil = new Date(now.getTime() + SITE_NOTICE_LEASE_MS);
        await tx.update(kakaoSiteNotices).set({ status: "LEASED", attempts: row.attempts + 1, leaseTokenHash: digest(leaseToken), leaseUntil })
          .where(eq(kakaoSiteNotices.id, row.id));
        return { event: { id: row.id, leaseToken, leaseUntil: leaseUntil.toISOString(),
          targetHash: config.targetHash.toString("hex"), text: `🎉 ${round.applyDate} 내전 #${round.recruitNo} 참가 10명이 모두 모였어요!\n${INHOUSE_DISCORD_WAIT_NOTICE}` }, pollAfterMs: 30_000 };
      }
      return { event: null, pollAfterMs: 30_000 };
    });
  }
}
