import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { userAccounts } from "./auth";
import { communityNetworkSchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const communityNetworkState = communityNetworkSchema.table("registry_state", {
  id: integer("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  updatedByUserAccountId: uuid("updated_by_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  check("community_network_state_singleton", sql`${table.id} = 1`),
  check("community_network_state_revision", sql`${table.revision} BETWEEN 0 AND 9007199254740991`),
]);

export const networkCommunities = communityNetworkSchema.table("communities", {
  id: uuid("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  origin: varchar("origin", { length: 300 }).notNull(),
  description: varchar("description", { length: 600 }).notNull(),
  state: varchar("state", { length: 16 }).$type<"DRAFT" | "LISTED" | "ARCHIVED">().notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("community_network_community_slug_uidx").on(table.slug),
  uniqueIndex("community_network_community_origin_uidx").on(table.origin),
  index("community_network_community_state_idx").on(table.state),
  check("community_network_community_slug", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("community_network_community_name", sql`char_length(${table.name}) > 0`),
  check("community_network_community_origin", sql`${table.origin} LIKE 'https://%'`),
  check("community_network_community_state", sql`${table.state} IN ('DRAFT', 'LISTED', 'ARCHIVED')`),
]);

export const networkRooms = communityNetworkSchema.table("rooms", {
  id: uuid("id").primaryKey(),
  communityId: uuid("community_id").notNull().references(() => networkCommunities.id, { onDelete: "restrict" }),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  purpose: varchar("purpose", { length: 16 }).$type<"CHAT" | "RECRUIT" | "EVENT" | "NOTICE">().notNull(),
  dataGroupKey: varchar("data_group_key", { length: 64 }).notNull(),
  active: boolean("active").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  index("community_network_room_community_idx").on(table.communityId),
  check("community_network_room_name", sql`char_length(${table.displayName}) > 0`),
  check("community_network_room_purpose", sql`${table.purpose} IN ('CHAT', 'RECRUIT', 'EVENT', 'NOTICE')`),
  check("community_network_room_data_group", sql`${table.dataGroupKey} ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$'`),
]);

export const communityNetworkCommandReceipts = communityNetworkSchema.table("command_receipts", {
  id: uuid("id").primaryKey(),
  actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  keyHash: bytea("key_hash").notNull(),
  requestHash: bytea("request_hash").notNull(),
  responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  uniqueIndex("community_network_receipt_actor_key_uidx").on(table.actorUserAccountId, table.keyHash),
  index("community_network_receipt_expires_idx").on(table.expiresAt),
  check("community_network_receipt_key", sql`octet_length(${table.keyHash}) = 32`),
  check("community_network_receipt_request", sql`octet_length(${table.requestHash}) = 32`),
  check("community_network_receipt_revision", sql`${table.revision} BETWEEN 0 AND 9007199254740991`),
  check("community_network_receipt_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);
