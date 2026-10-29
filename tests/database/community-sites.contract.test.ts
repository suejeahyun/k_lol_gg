import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import type { CommunitySiteCommandMetadata } from "../../src/modules/community-sites/application/ports";
import { CommunitySiteError } from "../../src/modules/community-sites/domain/community-site";
import { createDefaultCommunitySiteConfig } from "../../src/modules/community-sites/domain/site-configuration";
import { PostgresCommunitySitesRepository } from "../../src/modules/community-sites/infrastructure/postgres-community-sites-repository";
import { CommunitySiteProvisioningError, runNextCommunitySiteProvisioningJob } from "../../src/modules/community-sites/infrastructure/provisioning-worker";
import { createDatabaseHandle, type V2Database } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { authSessions, communitySiteCommandReceipts, communitySiteProvisioningJobs, communitySites, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function metadata(command: unknown, expectedRevision: number, requestKey: string = randomUUID()): CommunitySiteCommandMetadata {
  return { requestId: randomUUID(), requestKey, expectedRevision,
    requestHashHex: createHash("sha256").update(JSON.stringify({ command, expectedRevision })).digest("hex") };
}
const code = (expected: string) => (error: unknown) => error instanceof CommunitySiteError && error.code === expected;
async function createActor(database: V2Database, role: "USER" | "ADMIN" | "SUPER_ADMIN", purpose: "ACCOUNT" | "ADMIN"): Promise<TransactionSessionActor> {
  const userAccountId = randomUUID(); const sessionId = randomUUID(); const now = new Date();
  await database.insert(userAccounts).values({ id: userAccountId, loginId: `sites-${userAccountId}`, loginIdNormalized: `sites-${userAccountId}`, role, status: "APPROVED" });
  await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId, role, purpose, authVersion: 0,
    issuedAt: now, expiresAt: new Date(now.getTime() + 3600000), totpVerifiedAt: purpose === "ADMIN" ? now : null });
  return { userAccountId, sessionId, role, authVersion: 0 };
}

test("site applications isolate owners and durably queue reviewed provisioning without creating fake active sites", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "The isolated PostgreSQL harness is required.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const name = `klol_v2_test_sites_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^klol_v2_test_sites_[a-f0-9]{16}$/u);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    const url = new URL(connectionString); url.pathname = `/${name}`;
    assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
    const { database, pool } = createDatabaseHandle(url.toString(), { max: 4 });
    try {
      await applyMigrations(database);
      const repository = new PostgresCommunitySitesRepository(database);
      const owner = await createActor(database, "USER", "ACCOUNT");
      const outsider = await createActor(database, "USER", "ACCOUNT");
      const reviewer = await createActor(database, "SUPER_ADMIN", "ADMIN");
      const otherReviewer = await createActor(database, "SUPER_ADMIN", "ADMIN");
      const ordinaryAdmin = await createActor(database, "ADMIN", "ADMIN");
      const command = { action: "submit" as const, configuration: { ...createDefaultCommunitySiteConfig(), name: "격리 커뮤니티", slug: "isolated-community" } };
      const createInput = { actor: owner, command, metadata: metadata(command, 0) };
      let site = (await repository.createSite(createInput)).body.site;

      await t.test("owner lists, detail reads and writes are scoped while admin review is explicit", async () => {
        assert.equal(site.status, "SUBMITTED"); assert.equal(site.latestJob, null); assert.equal(site.origin, null);
        assert.deepEqual(await repository.getPublicSites(), []);
        assert.equal((await repository.listSites(owner, "owner")).length, 1);
        assert.deepEqual(await repository.listSites(outsider, "owner"), []);
        await assert.rejects(repository.getSite(outsider, site.id, "owner"), code("COMMUNITY_SITE_NOT_FOUND"));
        const cancel = { action: "cancel" as const };
        await assert.rejects(repository.updateSite({ actor: outsider, id: site.id, command: cancel, metadata: metadata(cancel, site.revision) }), code("COMMUNITY_SITE_NOT_FOUND"));
        await assert.rejects(repository.listSites(ordinaryAdmin, "admin"), code("SESSION_STALE"));
        assert.equal((await repository.listSites(reviewer, "admin")).length, 1);
      });
      await t.test("request replay is atomic and mismatched reuse, stale revision and duplicate slug are rejected", async () => {
        assert.equal((await repository.createSite(createInput)).replayed, true);
        const changed = { ...command, configuration: { ...command.configuration, name: "다른 내용" } };
        await assert.rejects(repository.createSite({ ...createInput, command: changed, metadata: metadata(changed, 0, createInput.metadata.requestKey) }), code("IDEMPOTENCY_MISMATCH"));
        await assert.rejects(repository.createSite({ actor: outsider, command, metadata: metadata(command, 0) }), code("COMMUNITY_SITE_UNIQUE_CONFLICT"));
        const update = { action: "update" as const, configuration: changed.configuration };
        await assert.rejects(repository.updateSite({ actor: owner, id: site.id, command: update, metadata: metadata(update, 0) }), code("STALE_COMMUNITY_SITE_REVISION"));
        assert.equal((await database.select().from(communitySiteCommandReceipts)).length, 1);
      });
      await t.test("changes can be requested and resubmitted before concurrent reviewers approve only once", async () => {
        const changes = { action: "request_changes" as const, reason: "소개를 보완해 주세요." };
        site = (await repository.reviewSite({ actor: reviewer, id: site.id, command: changes, metadata: metadata(changes, site.revision) })).body.site;
        const update = { action: "update" as const, configuration: { ...site.configuration, description: "보완된 소개" } };
        site = (await repository.updateSite({ actor: owner, id: site.id, command: update, metadata: metadata(update, site.revision) })).body.site;
        const submit = { action: "submit" as const };
        site = (await repository.updateSite({ actor: owner, id: site.id, command: submit, metadata: metadata(submit, site.revision) })).body.site;
        assert.equal(site.reviewReason, null);
        const approve = { action: "approve" as const, reason: "확인 완료" };
        const results = await Promise.allSettled([reviewer, otherReviewer].map((actor) => repository.reviewSite({ actor, id: site.id, command: approve, metadata: metadata(approve, site.revision) })));
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        const failed = results.find((result) => result.status === "rejected");
        assert.ok(failed && failed.status === "rejected" && code("STALE_COMMUNITY_SITE_REVISION")(failed.reason));
        site = await repository.getSite(owner, site.id, "owner");
        assert.equal(site.status, "APPROVED"); assert.equal(site.origin, null); assert.equal(site.publishedConfiguration, null);
        const jobs = await database.select().from(communitySiteProvisioningJobs);
        assert.equal(jobs.length, 1); assert.equal(jobs[0]!.status, "PENDING"); assert.equal(jobs[0]!.kind, "PROVISION");
        assert.deepEqual(jobs[0]!.configurationJson, site.configuration);
        await assert.rejects(repository.updateSite({ actor: owner, id: site.id, command: update, metadata: metadata(update, site.revision) }), code("COMMUNITY_SITE_STATE_CONFLICT"));
        const activate = { action: "activate" as const };
        await assert.rejects(repository.updateSite({ actor: owner, id: site.id, command: activate, metadata: metadata(activate, site.revision) }), code("COMMUNITY_SITE_STATE_CONFLICT"));
      });
      await t.test("failed audit rolls approval, queue and receipt back together", async () => {
        const secondCommand = { ...command, configuration: { ...command.configuration, slug: "second-community" } };
        const second = (await repository.createSite({ actor: outsider, command: secondCommand, metadata: metadata(secondCommand, 0) })).body.site;
        const approve = { action: "approve" as const, reason: "" };
        const counts = (await database.select().from(communitySiteCommandReceipts)).length;
        await assert.rejects(repository.reviewSite({ actor: reviewer, id: second.id, command: approve, metadata: { ...metadata(approve, second.revision), requestId: "invalid-audit-id" } }));
        assert.equal((await repository.getSite(outsider, second.id, "owner")).status, "SUBMITTED");
        assert.equal((await database.select().from(communitySiteProvisioningJobs)).length, 1);
        assert.equal((await database.select().from(communitySiteCommandReceipts)).length, counts);
      });
      await t.test("published settings stay unchanged until a separate successful worker run", async () => {
        // Synthetic worker completion in the disposable DB only: no external provider or real site is created.
        await database.update(communitySiteProvisioningJobs).set({ status: "SUCCEEDED", completedAt: new Date() }).where(eq(communitySiteProvisioningJobs.siteId, site.id));
        await database.update(communitySites).set({ status: "AWAITING_OWNER", origin: "https://synthetic.example", publishedConfigurationJson: site.configuration, revision: site.revision + 1 }).where(eq(communitySites.id, site.id));
        site = await repository.getSite(owner, site.id, "owner");
        const activate = { action: "activate" as const };
        site = (await repository.updateSite({ actor: owner, id: site.id, command: activate, metadata: metadata(activate, site.revision) })).body.site;
        assert.equal(site.status, "ACTIVATING"); assert.equal(site.latestJob!.kind, "ACTIVATE_SITE");
        assert.deepEqual(await repository.getPublicSites(), []);
        await assert.rejects(repository.updateSite({ actor: owner, id: site.id, command: activate, metadata: metadata(activate, site.revision) }), code("COMMUNITY_SITE_JOB_IN_PROGRESS"));
        const activationResult = await runNextCommunitySiteProvisioningJob(database, { step: async (input) => {
          assert.equal(input.job.kind, "ACTIVATE_SITE");
          return { checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic.example" };
        } });
        assert.equal(activationResult.kind, "completed"); site = await repository.getSite(owner, site.id, "owner");
        assert.equal(site.status, "ACTIVE");
        const update = { action: "update" as const, configuration: { ...site.configuration, name: "게시할 이름" } };
        site = (await repository.updateSite({ actor: owner, id: site.id, command: update, metadata: metadata(update, site.revision) })).body.site;
        assert.notEqual(site.configuration.name, site.publishedConfiguration!.name);
        const publish = { action: "publish" as const };
        site = (await repository.updateSite({ actor: owner, id: site.id, command: publish, metadata: metadata(publish, site.revision) })).body.site;
        assert.equal(site.latestJob!.kind, "PUBLISH_CONFIGURATION"); assert.equal(site.latestJob!.status, "PENDING");
        assert.notEqual(site.configuration.name, site.publishedConfiguration!.name);
        await assert.rejects(repository.updateSite({ actor: owner, id: site.id, command: publish, metadata: metadata(publish, site.revision) }), code("COMMUNITY_SITE_JOB_IN_PROGRESS"));
        const rename = { action: "update" as const, configuration: { ...site.configuration, slug: "renamed-live-site" } };
        await assert.rejects(repository.updateSite({ actor: owner, id: site.id, command: rename, metadata: metadata(rename, site.revision) }), code("COMMUNITY_SITE_SLUG_LOCKED"));
      });
      await t.test("publication worker keeps newer draft edits while publishing its immutable reviewed snapshot", async () => {
        const result = await runNextCommunitySiteProvisioningJob(database, { step: async (input) => {
          assert.equal(input.job.kind, "PUBLISH_CONFIGURATION");
          assert.equal(input.job.configuration.name, "게시할 이름");
          const update = { action: "update" as const, configuration: { ...input.site.configuration, name: "게시 중 저장한 다음 초안" } };
          await repository.updateSite({ actor: owner, id: site.id, command: update, metadata: metadata(update, input.site.revision) });
          return { checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic.example" };
        } });
        assert.equal(result.kind, "completed");
        site = await repository.getSite(owner, site.id, "owner");
        assert.equal(site.configuration.name, "게시 중 저장한 다음 초안");
        assert.equal(site.publishedConfiguration!.name, "게시할 이름");
        assert.deepEqual(await repository.getPublicSites(), [{ id: site.id, slug: site.configuration.slug, name: "게시할 이름", description: site.publishedConfiguration!.description, origin: "https://synthetic.example" }]);
        assert.doesNotMatch(JSON.stringify(await repository.getPublicSites()), /게시 중 저장|ownerUserAccountId|latestJob|reviewReason|configuration/);
      });
      await t.test("worker failure is sanitized, reapproval resumes the same resources, and overlapping workers claim only once", async () => {
        let second = (await repository.listSites(outsider, "owner")).find((entry) => entry.configuration.slug === "second-community")!;
        const approve = { action: "approve" as const, reason: "" };
        second = (await repository.reviewSite({ actor: reviewer, id: second.id, command: approve, metadata: metadata(approve, second.revision) })).body.site;
        const originalJobId = second.latestJob!.id;
        const originalJobRevision = second.revision;
        const progress = await runNextCommunitySiteProvisioningJob(database, { step: async () => ({ checkpoint: "DATABASE_CREATED", resources: { neonProjectId: "synthetic-provider-project" } }) });
        assert.equal(progress.kind, "progress");
        const failed = await runNextCommunitySiteProvisioningJob(database, { step: async () => { throw new Error("sensitive-provider-error-must-not-leak"); } });
        assert.equal(failed.kind, "failed"); assert.equal(failed.errorCode, "PROVISIONING_FAILED");
        second = await repository.getSite(outsider, second.id, "owner");
        assert.equal(second.status, "FAILED");
        assert.doesNotMatch(JSON.stringify(second), /sensitive-provider-error|synthetic-provider-project/u);
        second = (await repository.reviewSite({ actor: reviewer, id: second.id, command: approve, metadata: metadata(approve, second.revision) })).body.site;
        assert.equal(second.latestJob!.id, originalJobId);
        assert.equal(second.latestJob!.checkpoint, "DATABASE_CREATED");
        assert.equal((await database.select().from(communitySiteProvisioningJobs).where(eq(communitySiteProvisioningJobs.id, originalJobId)))[0]!.siteRevision, originalJobRevision);
        let signalStarted!: () => void; let release!: () => void;
        const started = new Promise<void>((resolve) => { signalStarted = resolve; });
        const hold = new Promise<void>((resolve) => { release = resolve; });
        let calls = 0;
        const first = runNextCommunitySiteProvisioningJob(database, { step: async (input) => {
          calls += 1; assert.equal(input.resources.neonProjectId, "synthetic-provider-project"); signalStarted(); await hold;
          return { checkpoint: "VERIFIED", resources: { vercelProjectId: "synthetic-vercel-project", vercelDeploymentId: "synthetic-first-deployment" }, completed: true, origin: "https://synthetic-second.example" };
        } });
        await started;
        assert.equal((await runNextCommunitySiteProvisioningJob(database, { step: async () => { calls += 1; throw new Error("must-not-run"); } })).kind, "idle");
        release(); assert.equal((await first).kind, "completed"); assert.equal(calls, 1);
        second = await repository.getSite(outsider, second.id, "owner");
        assert.equal(second.status, "AWAITING_OWNER");
        const activate = { action: "activate" as const };
        second = (await repository.updateSite({ actor: outsider, id: second.id, command: activate, metadata: metadata(activate, second.revision) })).body.site;
        assert.equal(second.status, "ACTIVATING");
        let activationWrites = 0; let childIsPublic = false;
        const activationFailed = await runNextCommunitySiteProvisioningJob(database, { step: async (input) => {
          assert.equal(input.activationMode, "APPLY");
          activationWrites += 1; childIsPublic = true;
          await database.update(userAccounts).set({ status: "SUSPENDED" }).where(eq(userAccounts.id, outsider.userAccountId));
          throw new Error("synthetic child commit succeeded but the acknowledgement was lost");
        } });
        assert.equal(activationFailed.kind, "pending");
        second = await repository.getSite(reviewer, second.id, "admin");
        const activationJobId = second.latestJob!.id;
        assert.equal(second.status, "ACTIVATING"); assert.equal(second.latestJob!.status, "PENDING");
        assert.ok(!(await repository.getPublicSites()).some((entry) => entry.id === second.id));
        await database.update(communitySiteProvisioningJobs).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(communitySiteProvisioningJobs.id, activationJobId));
        await runNextCommunitySiteProvisioningJob(database, { step: async (input) => {
          assert.equal(input.job.kind, "ACTIVATE_SITE"); assert.equal(input.job.siteRevision, originalJobRevision);
          assert.equal(input.job.id, activationJobId); assert.equal(input.activationMode, "OBSERVE_ONLY"); assert.equal(childIsPublic, true);
          return { checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic-second.example" };
        } });
        assert.equal(activationWrites, 1, "reconciliation observes the prior commit without a second publication write");
        assert.equal((await repository.getSite(reviewer, second.id, "admin")).status, "ACTIVE");
        await database.update(userAccounts).set({ status: "APPROVED" }).where(eq(userAccounts.id, outsider.userAccountId));
        second = await repository.getSite(outsider, second.id, "owner");
        assert.equal(second.status, "ACTIVE");
        const update = { action: "update" as const, configuration: { ...second.configuration, name: "운영자 확인 전 게시하면 안 되는 이름" } };
        second = (await repository.updateSite({ actor: outsider, id: second.id, command: update, metadata: metadata(update, second.revision) })).body.site;
        const publish = { action: "publish" as const };
        second = (await repository.updateSite({ actor: outsider, id: second.id, command: publish, metadata: metadata(publish, second.revision) })).body.site;
        const publishJob = (await database.select().from(communitySiteProvisioningJobs).where(eq(communitySiteProvisioningJobs.id, second.latestJob!.id)))[0]!;
        assert.equal(publishJob.resourceJson.neonProjectId, "synthetic-provider-project");
        assert.equal(publishJob.resourceJson.vercelProjectId, "synthetic-vercel-project");
        assert.equal(publishJob.resourceJson.vercelDeploymentId, undefined);
        const suspended = await runNextCommunitySiteProvisioningJob(database, { step: async () => {
          await database.update(userAccounts).set({ status: "SUSPENDED" }).where(eq(userAccounts.id, outsider.userAccountId));
          return { checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic-second.example" };
        } });
        assert.equal(suspended.kind, "failed"); assert.equal(suspended.errorCode, "OWNER_UNAVAILABLE");
        await database.update(userAccounts).set({ status: "APPROVED" }).where(eq(userAccounts.id, outsider.userAccountId));
        const unchanged = await repository.getSite(outsider, second.id, "owner");
        assert.notEqual(unchanged.configuration.name, unchanged.publishedConfiguration!.name);
        assert.equal(unchanged.status, "ACTIVE");
      });
      await t.test("revocation before activation permits observation only and returns to owner acceptance only after confirming the child is private", async () => {
        const command = { action: "submit" as const, configuration: { ...site.configuration, slug: "activation-not-applied" } };
        let target = (await repository.createSite({ actor: outsider, command, metadata: metadata(command, 0) })).body.site;
        const approve = { action: "approve" as const, reason: "" };
        target = (await repository.reviewSite({ actor: reviewer, id: target.id, command: approve, metadata: metadata(approve, target.revision) })).body.site;
        await runNextCommunitySiteProvisioningJob(database, { step: async () => ({ checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic-private.example" }) });
        target = await repository.getSite(outsider, target.id, "owner");
        const activate = { action: "activate" as const };
        target = (await repository.updateSite({ actor: outsider, id: target.id, command: activate, metadata: metadata(activate, target.revision) })).body.site;
        await database.update(userAccounts).set({ status: "SUSPENDED" }).where(eq(userAccounts.id, outsider.userAccountId));
        const observed = await runNextCommunitySiteProvisioningJob(database, { step: async (input) => {
          assert.equal(input.activationMode, "OBSERVE_ONLY");
          throw new CommunitySiteProvisioningError("ACTIVATION_NOT_APPLIED");
        } });
        assert.equal(observed.kind, "failed");
        target = await repository.getSite(reviewer, target.id, "admin");
        assert.equal(target.status, "AWAITING_OWNER"); assert.equal(target.latestJob!.errorCode, "ACTIVATION_NOT_APPLIED");
        await database.update(userAccounts).set({ status: "APPROVED" }).where(eq(userAccounts.id, outsider.userAccountId));
      });
      await t.test("an expired lease cannot commit completion and a new lease resumes the same job", async () => {
        const thirdCommand = { ...command, configuration: { ...command.configuration, slug: "lease-community" } };
        let third = (await repository.createSite({ actor: owner, command: thirdCommand, metadata: metadata(thirdCommand, 0) })).body.site;
        const approve = { action: "approve" as const, reason: "" };
        third = (await repository.reviewSite({ actor: reviewer, id: third.id, command: approve, metadata: metadata(approve, third.revision) })).body.site;
        const jobId = third.latestJob!.id;
        const expired = await runNextCommunitySiteProvisioningJob(database, { step: async () => {
          const lease = (await database.select({ expiresAt: communitySiteProvisioningJobs.leaseExpiresAt }).from(communitySiteProvisioningJobs).where(eq(communitySiteProvisioningJobs.id, jobId)))[0]!.expiresAt!;
          assert.ok(lease.getTime() - Date.now() > 180_000, "lease remains valid beyond the cron's 180-second execution budget");
          await database.update(communitySiteProvisioningJobs).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(communitySiteProvisioningJobs.id, jobId));
          return { checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic-lease.example" };
        } });
        assert.equal(expired.kind, "lost_lease");
        assert.equal((await repository.getSite(owner, third.id, "owner")).status, "PROVISIONING");
        const resumed = await runNextCommunitySiteProvisioningJob(database, { step: async (input) => {
          assert.equal(input.job.id, jobId); assert.equal(input.job.attemptCount, 2);
          return { checkpoint: "VERIFIED", resources: {}, completed: true, origin: "https://synthetic-lease.example" };
        } });
        assert.equal(resumed.kind, "completed");
        assert.equal((await repository.getSite(owner, third.id, "owner")).status, "AWAITING_OWNER");
      });
      await t.test("explicit retry rebuilds only a failed deployment and preserves the initialized child revision", async () => {
        const fourthCommand = { ...command, configuration: { ...command.configuration, slug: "deployment-retry-community" } };
        let fourth = (await repository.createSite({ actor: owner, command: fourthCommand, metadata: metadata(fourthCommand, 0) })).body.site;
        const approve = { action: "approve" as const, reason: "" };
        fourth = (await repository.reviewSite({ actor: reviewer, id: fourth.id, command: approve, metadata: metadata(approve, fourth.revision) })).body.site;
        const jobId = fourth.latestJob!.id;
        const initializedRevision = fourth.revision;
        await database.update(communitySiteProvisioningJobs).set({ status: "FAILED", checkpoint: "DEPLOYMENT_CREATED", errorCode: "PROVISIONING_FAILED",
          completedAt: new Date(), resourceJson: { neonProjectId: "kept-neon-project", vercelProjectId: "kept-vercel-project", vercelDeploymentId: "failed-deployment" } })
          .where(eq(communitySiteProvisioningJobs.id, jobId));
        await database.update(communitySites).set({ status: "FAILED", revision: fourth.revision + 4 }).where(eq(communitySites.id, fourth.id));
        fourth = await repository.getSite(owner, fourth.id, "owner");
        fourth = (await repository.reviewSite({ actor: reviewer, id: fourth.id, command: approve, metadata: metadata(approve, fourth.revision) })).body.site;
        const retry = (await database.select().from(communitySiteProvisioningJobs).where(eq(communitySiteProvisioningJobs.id, jobId)))[0]!;
        assert.equal(fourth.latestJob!.id, jobId); assert.equal(retry.siteRevision, initializedRevision);
        assert.equal(retry.checkpoint, "ENVIRONMENT_CONFIGURED");
        assert.deepEqual(retry.resourceJson, { neonProjectId: "kept-neon-project", vercelProjectId: "kept-vercel-project" });
        assert.equal(retry.status, "PENDING");
      });
      await t.test("revoked sessions and transferred ownership cannot replay old successful commands", async () => {
        await database.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, owner.sessionId));
        await assert.rejects(repository.createSite(createInput), code("SESSION_STALE"));
        await database.update(authSessions).set({ revokedAt: null }).where(eq(authSessions.id, owner.sessionId));
        await database.update(communitySites).set({ ownerUserAccountId: outsider.userAccountId }).where(eq(communitySites.id, site.id));
        await assert.rejects(repository.createSite(createInput), code("COMMUNITY_SITE_NOT_FOUND"));
        assert.equal((await repository.listSites(owner, "owner")).some((entry) => entry.id === site.id), false);
      });
    } finally { await pool.end(); }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
