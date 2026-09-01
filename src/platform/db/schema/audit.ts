import { bigint, index, jsonb, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { auditSchema } from "./namespaces";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const auditEvents = auditSchema.table(
  "events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    requestId: uuid("request_id").notNull(),
    actorUserAccountId: uuid("actor_user_account_id").references(() => userAccounts.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 96 }).notNull(),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 128 }).notNull(),
    beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
    afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_created_at_idx").on(table.createdAt),
    index("audit_events_actor_created_at_idx").on(table.actorUserAccountId, table.createdAt),
    index("audit_events_target_idx").on(table.targetType, table.targetId, table.createdAt),
    index("audit_events_request_id_idx").on(table.requestId),
  ],
);
