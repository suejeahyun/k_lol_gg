import { sql } from "drizzle-orm";
import { boolean, check, index, integer, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { userAccounts } from "./auth";
import { usageSchema as usage } from "./namespaces";
const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const usageCollection = usage.table("collection", {
  singleton: boolean("singleton").primaryKey().default(true),
  firstEventAt: time("first_event_at"),
  bucketAt: time("bucket_at").notNull().defaultNow(),
  bucketCount: integer("bucket_count").notNull().default(0),
}, (t) => [check("usage_singleton", sql`${t.singleton} = true`)]);
export const usageVisitors = usage.table("visitors", {
  id: uuid("id").primaryKey(),
  visitId: uuid("visit_id").notNull(),
  userAccountId: uuid("user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  lastSeenAt: time("last_seen_at").notNull(),
  bucketAt: time("bucket_at").notNull(),
  bucketCount: integer("bucket_count").notNull(),
}, (t) => [index("usage_visitors_seen_idx").on(t.lastSeenAt)]);
export const usageEvents = usage.table("events", {
  id: uuid("id").primaryKey(),
  visitorId: uuid("visitor_id").notNull(),
  visitId: uuid("visit_id").notNull(),
  userAccountId: uuid("user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 8 }).notNull(),
  route: varchar("route", { length: 80 }).notNull(),
  target: varchar("target", { length: 80 }),
  occurredAt: time("occurred_at").notNull().defaultNow(),
}, (t) => [index("usage_events_time_idx").on(t.occurredAt),
  index("usage_events_member_time_idx").on(t.userAccountId, t.occurredAt),
  check("usage_event_kind", sql`${t.kind} in ('page', 'click', 'search')`)]);
