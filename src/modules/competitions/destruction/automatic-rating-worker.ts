import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { V2Database } from "@/platform/db/database";
import { auditEvents, destructionCompetitions, destructionOutbox, mmrPlayerProfiles, mmrProjectionStates, riotAccountLinks, siteSettings } from "@/platform/db/schema";
import { readRiotProductionConfiguration } from "@/modules/riot/infrastructure/riot-runtime-policy";
import { RiotAesGcmIdentityProtector, parseRiotEncryptionKeyring } from "@/modules/riot/infrastructure/riot-identity-protector";
import { MMR_FORMULA_VERSION } from "@/modules/mmr/domain/mmr-projection";
import { advanceAutomaticRating } from "./automatic-rating";
import { AramSyncError } from "./aram-rating";
import { DEFAULT_RATING_POLICY, boundedRatingScore, validateRatingPolicy, type RatingComponent } from "./provisional-rating";
import { noRatingData, RiotRatingFacts } from "./riot-rating-facts";
import { RiotAramRecords } from "./riot-aram-records";
import type { DestructionAggregate } from "./state";

export type RatingWorkerResult = { kind: "UPDATED" | "IDLE" | "DISABLED" | "RATE_LIMITED"; retryAfterSeconds: number };

/** Scheduler-owned writes use a global budget lock and the same aggregate row lock as admin commands. */
export async function runAutomaticRatingStep(database: V2Database, now = new Date(), request: typeof fetch = fetch, configuration = readRiotProductionConfiguration(process.env)): Promise<RatingWorkerResult> {
  if (!configuration) return { kind: "DISABLED", retryAfterSeconds: 60 };
  return database.transaction(async (tx) => {
    const settings = (await tx.select({ features: siteSettings.featuresJson }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1))[0];
    if (settings?.features.riotIntegration !== true) return { kind: "DISABLED", retryAfterSeconds: 60 };
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended('destruction:aram:riot-budget', 0)) as acquired`);
    if (!(lock.rows[0] as { acquired?: boolean } | undefined)?.acquired) return { kind: "RATE_LIMITED", retryAfterSeconds: 8 };
    const latest = (await tx.select({ at: auditEvents.createdAt, metadata: auditEvents.metadataJson }).from(auditEvents)
      .where(inArray(auditEvents.action, ["DESTRUCTION_SYNC_ARAM_RECORD", "DESTRUCTION_AUTO_RATING"]))
      .orderBy(desc(auditEvents.createdAt)).limit(1))[0];
    const retryAt = Math.max(latest ? latest.at.getTime() + 8000 : 0, typeof latest?.metadata?.retryAt === "string" ? Date.parse(latest.metadata.retryAt) || 0 : 0);
    if (retryAt > now.getTime()) return { kind: "RATE_LIMITED", retryAfterSeconds: Math.ceil((retryAt - now.getTime()) / 1000) };
    const row = (await tx.select().from(destructionCompetitions).where(and(eq(destructionCompetitions.status, "TEAM_BUILDING"),
      sql`${destructionCompetitions.aggregateJson}->'configuration'->>'gameMode' in ('ARAM', 'ARAM_MAYHEM')`,
      sql`jsonb_array_length(${destructionCompetitions.aggregateJson}->'teams') = 0`,
      sql`exists (select 1 from jsonb_array_elements(${destructionCompetitions.aggregateJson}->'participants') p
        where coalesce(p->'ratingCollection'->>'complete', 'false') <> 'true'
        and coalesce(p->'ratingCollection'->>'retryAt', '') <= ${now.toISOString()})`))
      .orderBy(asc(destructionCompetitions.updatedAt), asc(destructionCompetitions.id)).limit(1).for("update", { skipLocked: true }))[0];
    if (!row) return { kind: "IDLE", retryAfterSeconds: 0 };
    const aggregate = row.aggregateJson as unknown as DestructionAggregate;
    if (aggregate.id !== row.id || aggregate.revision !== row.revision || aggregate.lifecycle.status !== row.status) throw new Error("DESTRUCTION_SNAPSHOT_INCONSISTENT");
    const policy = validateRatingPolicy(aggregate.ratingPolicy ?? DEFAULT_RATING_POLICY);
    const target = aggregate.participants.find((p) => !p.ratingCollection?.complete && (!p.ratingCollection || Date.parse(p.ratingCollection.retryAt) <= now.getTime()));
    if (!target || aggregate.teams.length) return { kind: "IDLE", retryAfterSeconds: 0 };
    const link = (await tx.select().from(riotAccountLinks).where(eq(riotAccountLinks.playerId, target.playerId)).limit(1).for("share"))[0];
    const connected = link?.status === "CONNECTED" && Boolean(link.protectedPuuid);
    const api = new RiotAramRecords(configuration.apiKey, configuration.regionalBaseUrl, request);
    const facts = new RiotRatingFacts(api, configuration.platformBaseUrl);
    const protector = new RiotAesGcmIdentityProtector(parseRiotEncryptionKeyring(configuration.encryptionKeys));
    const puuid = connected ? await protector.reveal(link!.protectedPuuid!) : null;
    const identityChanged = target.provisionalRating?.linkId !== undefined && (target.provisionalRating.linkId !== link?.id || target.provisionalRating.linkRevision !== link?.revision || !connected);
    // A legacy partial collection used a different time window and must not enter the new formula.
    const participant = identityChanged || !target.provisionalRating ? { ...target, aramCollection: undefined, aramRecord: undefined, minimumBid: undefined, ratingCollection: undefined, provisionalRating: undefined } : target;
    const next = await advanceAutomaticRating(participant, policy, now.toISOString(), {
      component: async (key): Promise<RatingComponent> => {
        if (key === "inhouse") {
          const profile = (await tx.select({ score: mmrPlayerProfiles.overallScoreBp, samples: mmrPlayerProfiles.sampleSize, formula: mmrPlayerProfiles.formulaVersion, calculatedAt: mmrPlayerProfiles.calculatedAt })
            .from(mmrPlayerProfiles).innerJoin(mmrProjectionStates, and(eq(mmrProjectionStates.key, "GLOBAL"), eq(mmrProjectionStates.status, "READY"), eq(mmrProjectionStates.generation, mmrPlayerProfiles.generation)))
            .where(eq(mmrPlayerProfiles.playerId, participant.playerId)).limit(1))[0];
          if (!profile || profile.samples < 1 || profile.formula !== MMR_FORMULA_VERSION) return noRatingData("유효한 내전 통계 없음 또는 공식 전환 대기", now.toISOString(), "INHOUSE");
          return { score: boundedRatingScore(50 + (profile.score / 100 - 50) * Math.min(profile.samples / 30, 1)), status: "READY", source: "INHOUSE", samples: profile.samples, observedAt: profile.calculatedAt.toISOString(), evidence: `내전 ${profile.samples}판 · ${profile.formula} ${profile.score / 100}점 · 30판까지 중립 보정` };
        }
        if (!puuid) throw new AramSyncError("NOT_CONNECTED");
        return facts[key](puuid, now.toISOString());
      },
      aram: (previous) => {
        if (!puuid || !link) throw new AramSyncError("NOT_CONNECTED");
        // Both modes deliberately use normal ARAM as the agreed 20% proxy; never request queue 2400.
        return api.next({ puuid, linkId: link.id, linkRevision: link.revision, previous, now: now.toISOString(), absolute: true });
      },
    });
    const updatedParticipant = { ...next, provisionalRating: { ...next.provisionalRating!, ...(connected ? { linkId: link!.id, linkRevision: link!.revision } : {}) } };
    const updated: DestructionAggregate = { ...aggregate, ratingPolicy: policy, revision: row.revision + 1, updatedAt: now.toISOString(), participants: aggregate.participants.map((p) => p.id === participant.id ? updatedParticipant : p) };
    const requestId = randomUUID();
    await tx.update(destructionCompetitions).set({ aggregateJson: JSON.parse(JSON.stringify(updated)), revision: updated.revision, updatedAt: now }).where(and(eq(destructionCompetitions.id, row.id), eq(destructionCompetitions.revision, row.revision)));
    await tx.insert(auditEvents).values({ requestId, actorUserAccountId: null, action: "DESTRUCTION_AUTO_RATING", targetType: "DESTRUCTION", targetId: row.id,
      beforeJson: { revision: row.revision }, afterJson: { revision: updated.revision, participantId: participant.id, rating: JSON.parse(JSON.stringify(updatedParticipant.provisionalRating)) },
      metadataJson: { source: "CRON", retryAt: next.ratingCollection?.error === "RATE_LIMITED" ? next.ratingCollection.retryAt : now.toISOString() }, createdAt: now });
    await tx.insert(destructionOutbox).values({ id: requestId, requestId, tournamentId: row.id, aggregateRevision: updated.revision, eventType: "DESTRUCTION_AUTO_RATING", dedupeKey: `${row.id}:${updated.revision}`, payloadJson: { tournamentId: row.id, revision: updated.revision, status: updated.lifecycle.status }, status: "PENDING", attemptCount: 0, createdAt: now });
    return { kind: "UPDATED", retryAfterSeconds: next.ratingCollection?.error === "RATE_LIMITED" ? Math.max(8, Math.ceil((Date.parse(next.ratingCollection.retryAt) - now.getTime()) / 1000)) : 8 };
  });
}
