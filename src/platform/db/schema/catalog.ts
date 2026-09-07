import { sql } from "drizzle-orm";
import { bigint, check, index, timestamp, varchar } from "drizzle-orm/pg-core";

import { catalogSchema } from "./namespaces";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const championCatalogStatus = catalogSchema.enum("champion_catalog_status", [
  "ACTIVE",
  "INACTIVE",
]);

export const championCatalog = catalogSchema.table(
  "champions",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    status: championCatalogStatus("status").default("ACTIVE").notNull(),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("champion_catalog_status_key_idx").on(table.status, table.key),
    check("champion_catalog_key_canonical", sql`${table.key} ~ '^[a-z0-9][a-z0-9._-]{0,63}$'`),
    check("champion_catalog_display_name_nonempty", sql`char_length(${table.displayName}) > 0`),
    check("champion_catalog_revision_nonnegative", sql`${table.revision} >= 0`),
  ],
);
