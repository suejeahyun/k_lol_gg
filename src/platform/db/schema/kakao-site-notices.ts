import { sql } from "drizzle-orm";
import { check, index, integer, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { recruitingSchema } from "./namespaces";
import { bytea } from "./primitives";
import { seasonInhouseRounds } from "./seasons";

const instant = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

/** No participant names, physical room identifiers, or free-form message text. */
export const kakaoSiteNotices = recruitingSchema.table("kakao_site_notices", {
  id: uuid("id").primaryKey(),
  eventKey: varchar("event_key", { length: 100 }).notNull(),
  roundId: uuid("round_id").notNull().references(() => seasonInhouseRounds.id, { onDelete: "restrict" }),
  sourceRoomIdHash: bytea("source_room_id_hash").notNull(),
  targetHash: bytea("target_hash").notNull(),
  status: varchar("status", { length: 16 }).default("PENDING").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  availableAt: instant("available_at").notNull(),
  leaseTokenHash: bytea("lease_token_hash"),
  leaseUntil: instant("lease_until"),
  expiresAt: instant("expires_at").notNull(),
  deliveredAt: instant("delivered_at"),
  failureCode: varchar("failure_code", { length: 32 }),
  createdAt: instant("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("kakao_site_notices_event_uidx").on(table.eventKey),
  index("kakao_site_notices_claim_idx").on(table.sourceRoomIdHash, table.targetHash, table.status, table.availableAt),
  index("kakao_site_notices_expiry_idx").on(table.expiresAt),
  check("kakao_site_notices_status", sql`${table.status} IN ('PENDING','LEASED','DELIVERED','FAILED','EXPIRED')`),
  check("kakao_site_notices_attempts", sql`${table.attempts} BETWEEN 0 AND 20`),
  check("kakao_site_notices_hashes", sql`octet_length(${table.sourceRoomIdHash}) = 32 AND octet_length(${table.targetHash}) = 32 AND (${table.leaseTokenHash} IS NULL OR octet_length(${table.leaseTokenHash}) = 32)`),
  check("kakao_site_notices_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  check("kakao_site_notices_lease", sql`(${table.status} = 'LEASED' AND ${table.leaseTokenHash} IS NOT NULL AND ${table.leaseUntil} IS NOT NULL) OR (${table.status} <> 'LEASED' AND ${table.leaseUntil} IS NULL)`),
  check("kakao_site_notices_delivery", sql`(${table.status} = 'DELIVERED') = (${table.deliveredAt} IS NOT NULL)`),
]);
