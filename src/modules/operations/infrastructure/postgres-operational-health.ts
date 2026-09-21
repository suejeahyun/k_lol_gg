import { and, desc, eq, sql } from "drizzle-orm";
import type { V2Database } from "@/platform/db/database";
import { matchRecalculationOutbox } from "@/platform/db/schema/matches";
import { maintenanceRuns, siteSettings } from "@/platform/db/schema/operations";
import { riotSyncJobs } from "@/platform/db/schema/riot";
import { kakaoSiteNotices } from "@/platform/db/schema/kakao-site-notices";
import { recruitingNonceBindings } from "@/platform/db/schema/recruiting";
import { siteNoticeConfig } from "@/modules/seasons/kakao-site-notices/domain";
import { getRuntimeKakaoV4SigningSecrets } from "@/modules/recruiting/kakao-v4/installation-scope";
import { readRiotConfigurationReadiness } from "@/modules/riot/infrastructure/riot-runtime-policy";
import type { MaintenanceObservation, OperationalHealthSnapshot } from "../application/operational-health";

const iso = (value: Date | string | null | undefined) => value == null ? null : (typeof value === "string" ? new Date(value) : value).toISOString();

export async function readOperationalHealth(
  database: V2Database,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): Promise<OperationalHealthSnapshot> {
  const riotReadiness = readRiotConfigurationReadiness(environment);
  const noticeConfig = siteNoticeConfig(environment);
  const noticeConfigured = Boolean(noticeConfig && getRuntimeKakaoV4SigningSecrets(environment)?.length);
  return database.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    const latestRun = (jobName: string) => tx.select({
      status: maintenanceRuns.status,
      startedAt: maintenanceRuns.startedAt,
      completedAt: maintenanceRuns.completedAt,
      realStorage: sql<boolean>`${maintenanceRuns.countsJson}->>'realStorage' = '1'`,
    }).from(maintenanceRuns).where(eq(maintenanceRuns.jobName, jobName))
      .orderBy(desc(maintenanceRuns.startedAt), desc(maintenanceRuns.id)).limit(1);
    // A transaction owns one pg connection; concurrent queries cannot run in parallel.
    const statistics = await tx.select({
        pending: sql<number>`count(*) filter (where ${matchRecalculationOutbox.status} in ('PENDING', 'PROCESSING'))::integer`,
        failed: sql<number>`count(*) filter (where ${matchRecalculationOutbox.status} = 'FAILED')::integer`,
        oldestPendingAt: sql<string | null>`min(${matchRecalculationOutbox.createdAt}) filter (where ${matchRecalculationOutbox.status} in ('PENDING', 'PROCESSING'))`,
        lastConsumedAt: sql<string | null>`max(${matchRecalculationOutbox.deliveredAt})`,
      }).from(matchRecalculationOutbox);
    const dailyClose = await latestRun("kakao-daily-close");
    const storage = await latestRun("storage-probe");
    const riot = await tx.select({
        pending: sql<number>`count(*) filter (where ${riotSyncJobs.status} in ('QUEUED', 'RUNNING', 'RETRY_WAIT'))::integer`,
        failed: sql<number>`count(*) filter (where ${riotSyncJobs.status} in ('FAILED', 'PARTIAL') and ${riotSyncJobs.completedAt} >= ${new Date(now.getTime() - 86_400_000)})::integer`,
        oldestPendingAt: sql<string | null>`min(${riotSyncJobs.requestedAt}) filter (where ${riotSyncJobs.status} in ('QUEUED', 'RUNNING', 'RETRY_WAIT'))`,
        lastCompletedAt: sql<string | null>`max(${riotSyncJobs.completedAt}) filter (where ${riotSyncJobs.status} in ('SUCCEEDED', 'PARTIAL'))`,
      }).from(riotSyncJobs);
    const settings = await tx.select({ enabled: sql<boolean | null>`case when jsonb_typeof(${siteSettings.featuresJson}->'riotIntegration') = 'boolean' then (${siteSettings.featuresJson}->>'riotIntegration')::boolean else null end` })
        .from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
    const notices = await tx.select({
        pending: sql<number>`count(*) filter (where ${kakaoSiteNotices.status} in ('PENDING', 'LEASED') and ${kakaoSiteNotices.expiresAt} > ${now})::integer`,
        failed: sql<number>`count(*) filter (where ${kakaoSiteNotices.status} = 'FAILED')::integer`,
        expiredPending: sql<number>`count(*) filter (where ${kakaoSiteNotices.status} in ('PENDING', 'LEASED') and ${kakaoSiteNotices.expiresAt} <= ${now})::integer`,
        oldestPendingAt: sql<string | null>`min(${kakaoSiteNotices.createdAt}) filter (where ${kakaoSiteNotices.status} in ('PENDING', 'LEASED') and ${kakaoSiteNotices.expiresAt} > ${now})`,
        lastAcknowledgedAt: sql<string | null>`max(${kakaoSiteNotices.deliveredAt})`,
      }).from(kakaoSiteNotices).where(noticeConfig ? and(eq(kakaoSiteNotices.sourceRoomIdHash, noticeConfig.sourceRoomIdHash), eq(kakaoSiteNotices.targetHash, noticeConfig.targetHash)) : sql`false`);
    const authenticated = await tx.select({ latest: sql<string | null>`max(${recruitingNonceBindings.createdAt})` }).from(recruitingNonceBindings)
        .where(noticeConfig ? and(eq(recruitingNonceBindings.actorKind, "BOT"), eq(recruitingNonceBindings.actorPrincipalId, `site-notice:${noticeConfig.installationId}`)) : sql`false`);
    const riotProbe = await latestRun("riot-api-probe");
    const run = (rows: typeof dailyClose): MaintenanceObservation | null => rows[0] ? {
      status: rows[0].status, startedAt: rows[0].startedAt.toISOString(), completedAt: iso(rows[0].completedAt), realStorage: rows[0].realStorage === true,
    } : null;
    return {
      checkedAt: now.toISOString(),
      statistics: { pending: statistics[0]!.pending, failed: statistics[0]!.failed, oldestPendingAt: iso(statistics[0]!.oldestPendingAt), lastConsumedAt: iso(statistics[0]!.lastConsumedAt) },
      dailyClose: run(dailyClose),
      storage: run(storage),
      riot: { integrationEnabled: riotReadiness.integrationEnabled, apiConfigured: riotReadiness.apiConfigured, rsoConfigured: riotReadiness.rsoConfigured,
        siteEnabled: settings[0]?.enabled ?? null, synthetic: environment.V2_RIOT_FAKE_RUNTIME === "true",
        pending: riot[0]!.pending, failed: riot[0]!.failed, oldestPendingAt: iso(riot[0]!.oldestPendingAt), lastCompletedAt: iso(riot[0]!.lastCompletedAt), apiProbe: run(riotProbe) },
      siteNotices: { enabled: environment.KAKAO_SITE_NOTICE_ENABLED === "true", configured: noticeConfigured,
        pending: notices[0]!.pending, failed: notices[0]!.failed, expiredPending: notices[0]!.expiredPending,
        oldestPendingAt: iso(notices[0]!.oldestPendingAt), lastAuthenticatedAt: iso(authenticated[0]?.latest), lastAcknowledgedAt: iso(notices[0]!.lastAcknowledgedAt) },
    };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
