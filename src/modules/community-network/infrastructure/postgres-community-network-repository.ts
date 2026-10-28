import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { ADMIN_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import { communityNetworkCommandReceipts, communityNetworkState, networkCommunities, networkRooms } from "@/platform/db/schema/community-network";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";
import type { CommunityNetworkCommandResult, CommunityNetworkRepository } from "../application/ports";
import { CommunityNetworkError, createCommunityNetworkSnapshot, parseCommunityNetworkInput, toCommunityNetworkPublicDirectory, updateCommunityNetworkSnapshot, type CommunityNetworkSnapshot } from "../domain/community-network";

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;
const communityColumns = {
  id: networkCommunities.id, slug: networkCommunities.slug, name: networkCommunities.name,
  origin: networkCommunities.origin, description: networkCommunities.description, state: networkCommunities.state,
};
const roomColumns = {
  id: networkRooms.id, communityId: networkRooms.communityId, displayName: networkRooms.displayName,
  purpose: networkRooms.purpose, dataGroupKey: networkRooms.dataGroupKey, active: networkRooms.active,
};

async function readSnapshot(transaction: V2Transaction, revision: number): Promise<CommunityNetworkSnapshot> {
  const communities = await transaction.select(communityColumns).from(networkCommunities).orderBy(asc(networkCommunities.slug));
  const rooms = await transaction.select(roomColumns).from(networkRooms).orderBy(asc(networkRooms.communityId), asc(networkRooms.id));
  return createCommunityNetworkSnapshot({ communities, rooms }, revision);
}

function auditSummary(snapshot: CommunityNetworkSnapshot) {
  return {
    revision: snapshot.revision,
    communities: snapshot.communities.length,
    listedCommunities: snapshot.communities.filter((item) => item.state === "LISTED").length,
    archivedCommunities: snapshot.communities.filter((item) => item.state === "ARCHIVED").length,
    rooms: snapshot.rooms.length,
    activeRooms: snapshot.rooms.filter((item) => item.active).length,
    connectionStatus: snapshot.connectionStatus,
    routingStatus: snapshot.routingStatus,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "23505" || (!!candidate.cause && candidate.cause !== error && isUniqueViolation(candidate.cause));
}

export class PostgresCommunityNetworkRepository implements CommunityNetworkRepository {
  constructor(private readonly database: V2Database) {}

  async getSnapshot(): Promise<CommunityNetworkSnapshot> {
    return withTransaction(this.database, async (transaction) => {
      // A shared revision lock keeps both normalized collections in the same snapshot.
      const state = (await transaction.select().from(communityNetworkState).where(eq(communityNetworkState.id, 1)).for("share").limit(1))[0];
      if (!state) return createCommunityNetworkSnapshot({ communities: [], rooms: [] }, 0);
      return readSnapshot(transaction, state.revision);
    });
  }

  async getPublicDirectory() {
    // Never query rooms, receipts, private drafts or another service's database for the public directory.
    const rows = await this.database.select(communityColumns).from(networkCommunities)
      .where(eq(networkCommunities.state, "LISTED")).orderBy(asc(networkCommunities.slug));
    return toCommunityNetworkPublicDirectory(parseCommunityNetworkInput({ communities: rows, rooms: [] }));
  }

  async updateSnapshot(input: Parameters<CommunityNetworkRepository["updateSnapshot"]>[0]): Promise<CommunityNetworkCommandResult> {
    try {
      return await withTransaction(this.database, async (transaction) => {
        // Session/account revocation and demotion must be checked before idempotent replay too.
        const actor = await lockTransactionSessionActor(transaction, input.actor, new Date(), {
          ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: "SUPER_ADMIN",
        });
        if (!actor) throw new CommunityNetworkError("SESSION_STALE");
        if (!/^[a-f0-9]{64}$/u.test(input.metadata.requestHashHex)) throw new CommunityNetworkError("INVALID_REQUEST_HASH");
        const keyHash = createHash("sha256").update(`community-network:snapshot:v1\0${input.metadata.requestKey}`).digest();
        const requestHash = Buffer.from(input.metadata.requestHashHex, "hex");
        const receiptWhere = and(eq(communityNetworkCommandReceipts.actorUserAccountId, actor.id), eq(communityNetworkCommandReceipts.keyHash, keyHash));
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`community-network:${actor.id}:${keyHash.toString("hex")}`}, 0))`);
        const receipt = (await transaction.select().from(communityNetworkCommandReceipts).where(receiptWhere).limit(1))[0];
        if (receipt && receipt.expiresAt > new Date()) {
          if (!Buffer.from(receipt.requestHash).equals(requestHash)) throw new CommunityNetworkError("IDEMPOTENCY_MISMATCH");
          const stored = receipt.responseJson.snapshot as CommunityNetworkSnapshot;
          const snapshot = createCommunityNetworkSnapshot({ communities: stored.communities, rooms: stored.rooms }, receipt.revision);
          return { status: 200, body: { snapshot }, revision: snapshot.revision, replayed: true };
        }

        await transaction.insert(communityNetworkState).values({ id: 1 }).onConflictDoNothing();
        const state = (await transaction.select().from(communityNetworkState).where(eq(communityNetworkState.id, 1)).for("update").limit(1))[0];
        if (!state) throw new CommunityNetworkError("COMMUNITY_NETWORK_UNAVAILABLE");
        const current = await readSnapshot(transaction, state.revision);
        const next = updateCommunityNetworkSnapshot(current, input.snapshot, input.metadata.expectedRevision);
        const now = new Date();
        const previousCommunityIds = new Set(current.communities.map((item) => item.id));
        for (const community of next.communities) {
          if (previousCommunityIds.has(community.id)) {
            await transaction.update(networkCommunities).set({ ...community, updatedAt: now }).where(eq(networkCommunities.id, community.id));
          } else {
            await transaction.insert(networkCommunities).values({ ...community, createdAt: now, updatedAt: now });
          }
        }
        const previousRoomIds = new Set(current.rooms.map((item) => item.id));
        for (const room of next.rooms) {
          if (previousRoomIds.has(room.id)) {
            await transaction.update(networkRooms).set({ ...room, updatedAt: now }).where(eq(networkRooms.id, room.id));
          } else {
            await transaction.insert(networkRooms).values({ ...room, createdAt: now, updatedAt: now });
          }
        }
        await transaction.update(communityNetworkState).set({ revision: next.revision, updatedByUserAccountId: actor.id, updatedAt: now }).where(eq(communityNetworkState.id, 1));
        const body = { snapshot: next };
        await transaction.delete(communityNetworkCommandReceipts).where(receiptWhere);
        await transaction.insert(communityNetworkCommandReceipts).values({
          id: randomUUID(), actorUserAccountId: actor.id, keyHash, requestHash, responseJson: body,
          revision: next.revision, createdAt: now, expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS),
        });
        await transaction.insert(auditEvents).values({
          requestId: input.metadata.requestId, actorUserAccountId: actor.id,
          action: "COMMUNITY_NETWORK_REGISTRY_UPDATED", targetType: "COMMUNITY_NETWORK", targetId: "GLOBAL",
          beforeJson: auditSummary(current), afterJson: auditSummary(next),
          metadataJson: { metadataOnly: true, phoneRoutingChanged: false }, createdAt: now,
        });
        return { status: 200, body, revision: next.revision, replayed: false };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new CommunityNetworkError("COMMUNITY_NETWORK_UNIQUE_CONFLICT");
      throw error;
    }
  }
}
