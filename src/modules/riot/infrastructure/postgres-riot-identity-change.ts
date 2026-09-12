import { and, eq, inArray, sql } from "drizzle-orm";

import { auditEvents } from "@/platform/db/schema/audit";
import { riotAccountLinks, riotSyncJobs } from "@/platform/db/schema/riot";
import type { V2Transaction } from "@/platform/db/transaction";

type RiotIdentityChangeSource = "OWNER_PROFILE" | "ADMIN_PROFILE";

type DisconnectConnectedRiotIdentityInput = Readonly<{
  playerId: string;
  nextGameName: string;
  nextTagLine: string;
  actorUserAccountId: string;
  requestId: string;
  now: Date;
  source: RiotIdentityChangeSource;
}>;

type DisconnectConnectedRiotIdentityResult = Readonly<{
  disconnected: boolean;
  previousRiotId?: string;
}>;

function normalizedRiotIdentityKey(gameName: string, tagLine: string): string {
  const canonicalGameName = gameName.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const canonicalTagLine = tagLine.normalize("NFKC").trim();
  return `${canonicalGameName.toLocaleLowerCase("ko-KR")}#${canonicalTagLine.toLocaleLowerCase("en-US")}`;
}

/**
 * Disconnects a verified Riot identity when its registry Riot ID is changed.
 *
 * This must run inside the same transaction as the registry player update so a
 * connected PUUID can never remain associated with a different display Riot ID.
 */
export async function disconnectConnectedRiotIdentityForPlayer(
  transaction: V2Transaction,
  input: DisconnectConnectedRiotIdentityInput,
): Promise<DisconnectConnectedRiotIdentityResult> {
  const link = (
    await transaction
      .select({
        id: riotAccountLinks.id,
        revision: riotAccountLinks.revision,
        gameName: riotAccountLinks.gameName,
        tagLine: riotAccountLinks.tagLine,
      })
      .from(riotAccountLinks)
      .where(and(
        eq(riotAccountLinks.playerId, input.playerId),
        eq(riotAccountLinks.status, "CONNECTED"),
      ))
      .for("update")
      .limit(1)
  )[0];

  const nextNormalizedKey = normalizedRiotIdentityKey(input.nextGameName, input.nextTagLine);
  if (!link || normalizedRiotIdentityKey(link.gameName, link.tagLine) === nextNormalizedKey) {
    return { disconnected: false };
  }

  const disconnected = (
    await transaction
      .update(riotAccountLinks)
      .set({
        status: "DISCONNECTED",
        protectedPuuid: null,
        disconnectedAt: input.now,
        revision: sql`${riotAccountLinks.revision} + 1`,
        updatedAt: input.now,
      })
      .where(and(
        eq(riotAccountLinks.id, link.id),
        eq(riotAccountLinks.status, "CONNECTED"),
        eq(riotAccountLinks.revision, link.revision),
      ))
      .returning({ revision: riotAccountLinks.revision })
  )[0];
  if (!disconnected) throw new Error("RIOT_LINK_CHANGED_DURING_REGISTRY_ID_UPDATE");

  const cancelledJobs = await transaction
    .update(riotSyncJobs)
    .set({
      status: "CANCELLED",
      lockedAt: null,
      leaseId: null,
      completedAt: input.now,
      failureCode: null,
      revision: sql`${riotSyncJobs.revision} + 1`,
      updatedAt: input.now,
    })
    .where(and(
      eq(riotSyncJobs.linkId, link.id),
      inArray(riotSyncJobs.status, ["QUEUED", "RETRY_WAIT", "RUNNING"]),
    ))
    .returning({ id: riotSyncJobs.id });

  const previousRiotId = `${link.gameName}#${link.tagLine}`;
  await transaction.insert(auditEvents).values({
    requestId: input.requestId,
    actorUserAccountId: input.actorUserAccountId,
    action: "RIOT_LINK_DISCONNECTED_ON_REGISTRY_ID_CHANGE",
    targetType: "RIOT_ACCOUNT_LINK",
    targetId: link.id,
    beforeJson: {
      linkId: link.id,
      playerId: input.playerId,
      riotId: previousRiotId,
      status: "CONNECTED",
      revision: link.revision,
    },
    afterJson: {
      linkId: link.id,
      playerId: input.playerId,
      riotId: previousRiotId,
      status: "DISCONNECTED",
      revision: disconnected.revision,
    },
    metadataJson: {
      source: input.source,
      reason: "REGISTRY_RIOT_ID_CHANGED",
      nextRegistryRiotId: `${input.nextGameName}#${input.nextTagLine}`,
      cancelledSyncJobCount: cancelledJobs.length,
    },
    createdAt: input.now,
  });

  return { disconnected: true, previousRiotId };
}
