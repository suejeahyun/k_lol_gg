import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { registrySchema } from "./namespaces";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const playerStatus = registrySchema.enum("player_status", ["ACTIVE", "INACTIVE"]);

export const players = registrySchema.table(
  "players",
  {
    id: uuid("id").primaryKey(),
    userAccountId: uuid("user_account_id").references(() => userAccounts.id, {
      onDelete: "set null",
    }),
    memberName: varchar("member_name", { length: 100 }).notNull(),
    memberNameNormalized: varchar("member_name_normalized", { length: 100 }).notNull(),
    nickname: varchar("nickname", { length: 64 }).notNull(),
    nicknameNormalized: varchar("nickname_normalized", { length: 64 }).notNull(),
    tagLine: varchar("tag_line", { length: 32 }).notNull(),
    tagLineNormalized: varchar("tag_line_normalized", { length: 32 }).notNull(),
    peakTier: varchar("peak_tier", { length: 32 }),
    currentTier: varchar("current_tier", { length: 32 }),
    status: playerStatus("status").default("ACTIVE").notNull(),
    deactivatedAt: timestamptz("deactivated_at"),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("players_user_account_id_uidx").on(table.userAccountId),
    uniqueIndex("players_nickname_tag_line_normalized_uidx").on(
      table.nicknameNormalized,
      table.tagLineNormalized,
    ),
    index("players_status_updated_at_idx").on(table.status, table.updatedAt),
    index("players_nickname_normalized_idx").on(table.nicknameNormalized),
    index("players_member_name_normalized_idx").on(table.memberNameNormalized),
    check("players_member_name_normalized_nonempty", sql`char_length(${table.memberNameNormalized}) > 0`),
    check("players_nickname_normalized_nonempty", sql`char_length(${table.nicknameNormalized}) > 0`),
    check("players_tag_line_normalized_nonempty", sql`char_length(${table.tagLineNormalized}) > 0`),
    check("players_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "players_status_deactivated_consistency",
      sql`(
        (${table.status} = 'ACTIVE' AND ${table.deactivatedAt} IS NULL)
        OR
        (${table.status} = 'INACTIVE' AND ${table.deactivatedAt} IS NOT NULL)
      )`,
    ),
  ],
);
