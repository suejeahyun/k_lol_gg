import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { privateAssets } from "./matches";
import { mediaSchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const mediaPublicationStatus = mediaSchema.enum("publication_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const mediaOutboxStatus = mediaSchema.enum("outbox_status", ["PENDING", "DELIVERED"]);

export const mediaHighlights = mediaSchema.table(
  "highlights",
  {
    id: uuid("id").primaryKey(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: varchar("description", { length: 4000 }).notNull(),
    youtubeId: varchar("youtube_id", { length: 11 }).notNull(),
    thumbnailAssetId: uuid("thumbnail_asset_id").references(() => privateAssets.id, { onDelete: "restrict" }),
    legacyThumbnailUrl: varchar("legacy_thumbnail_url", { length: 2_048 }),
    status: mediaPublicationStatus("status").default("DRAFT").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdByUserAccountId: uuid("created_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    updatedByUserAccountId: uuid("updated_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    publishedAt: timestamptz("published_at"),
    archivedAt: timestamptz("archived_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("media_highlights_public_idx").on(table.status, table.sortOrder, table.id),
    index("media_highlights_updated_idx").on(table.updatedAt.desc(), table.id),
    uniqueIndex("media_highlights_legacy_id_uidx").on(table.legacyId),
    uniqueIndex("media_highlights_thumbnail_asset_uidx")
      .on(table.thumbnailAssetId)
      .where(sql`${table.thumbnailAssetId} IS NOT NULL`),
    check("media_highlights_revision_nonnegative", sql`${table.revision} >= 0`),
    check("media_highlights_legacy_id_positive", sql`${table.legacyId} IS NULL OR ${table.legacyId} > 0`),
    check("media_highlights_legacy_thumbnail_url", sql`${table.legacyThumbnailUrl} IS NULL OR (
      char_length(${table.legacyThumbnailUrl}) BETWEEN 1 AND 2048
      AND ${table.legacyThumbnailUrl} !~ '[[:cntrl:]]'
      AND (${table.legacyThumbnailUrl} ~ '^https://' OR ${table.legacyThumbnailUrl} ~ '^/images/')
    )`),
    check("media_highlights_title_nonempty", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`),
    check("media_highlights_description_nonempty", sql`char_length(btrim(${table.description})) BETWEEN 1 AND 4000`),
    check("media_highlights_youtube_id", sql`${table.youtubeId} ~ '^[A-Za-z0-9_-]{11}$'`),
    check("media_highlights_sort_order", sql`${table.sortOrder} BETWEEN -100000 AND 100000`),
    check("media_highlights_lifecycle", sql`(
      (${table.status} = 'DRAFT' AND ${table.publishedAt} IS NULL AND ${table.archivedAt} IS NULL)
      OR (${table.status} = 'PUBLISHED' AND ${table.publishedAt} IS NOT NULL AND ${table.archivedAt} IS NULL)
      OR (${table.status} = 'ARCHIVED' AND ${table.archivedAt} IS NOT NULL)
    )`),
  ],
);

export const mediaGalleries = mediaSchema.table(
  "galleries",
  {
    id: uuid("id").primaryKey(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: varchar("description", { length: 4000 }).notNull(),
    showOnHome: boolean("show_on_home").default(false).notNull(),
    status: mediaPublicationStatus("status").default("DRAFT").notNull(),
    createdByUserAccountId: uuid("created_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    updatedByUserAccountId: uuid("updated_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    publishedAt: timestamptz("published_at"),
    archivedAt: timestamptz("archived_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("media_galleries_public_idx").on(table.status, table.publishedAt.desc(), table.id),
    index("media_galleries_updated_idx").on(table.updatedAt.desc(), table.id),
    uniqueIndex("media_galleries_legacy_id_uidx").on(table.legacyId),
    check("media_galleries_revision_nonnegative", sql`${table.revision} >= 0`),
    check("media_galleries_legacy_id_positive", sql`${table.legacyId} IS NULL OR ${table.legacyId} > 0`),
    check("media_galleries_title_nonempty", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`),
    check("media_galleries_description_nonempty", sql`char_length(btrim(${table.description})) BETWEEN 1 AND 4000`),
    check("media_galleries_home_published", sql`${table.showOnHome} = false OR ${table.status} = 'PUBLISHED'`),
    check("media_galleries_lifecycle", sql`(
      (${table.status} = 'DRAFT' AND ${table.publishedAt} IS NULL AND ${table.archivedAt} IS NULL)
      OR (${table.status} = 'PUBLISHED' AND ${table.publishedAt} IS NOT NULL AND ${table.archivedAt} IS NULL)
      OR (${table.status} = 'ARCHIVED' AND ${table.archivedAt} IS NOT NULL)
    )`),
  ],
);

export const mediaGalleryExternalImages = mediaSchema.table(
  "gallery_external_images",
  {
    galleryId: uuid("gallery_id").notNull().references(() => mediaGalleries.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    sourceUrl: varchar("source_url", { length: 2_048 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.galleryId, table.ordinal] }),
    uniqueIndex("media_gallery_external_images_gallery_url_uidx").on(table.galleryId, table.sourceUrl),
    check("media_gallery_external_images_ordinal", sql`${table.ordinal} BETWEEN 0 AND 4`),
    check("media_gallery_external_images_source_url", sql`
      char_length(${table.sourceUrl}) BETWEEN 1 AND 2048
      AND ${table.sourceUrl} !~ '[[:cntrl:]]'
      AND (${table.sourceUrl} ~ '^https://' OR ${table.sourceUrl} ~ '^/images/')
    `),
  ],
);

export const mediaGalleryAssets = mediaSchema.table(
  "gallery_assets",
  {
    galleryId: uuid("gallery_id").notNull().references(() => mediaGalleries.id, { onDelete: "restrict" }),
    privateAssetId: uuid("private_asset_id").notNull().references(() => privateAssets.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.galleryId, table.privateAssetId] }),
    uniqueIndex("media_gallery_assets_gallery_ordinal_uidx").on(table.galleryId, table.ordinal),
    uniqueIndex("media_gallery_assets_asset_uidx").on(table.privateAssetId),
    check("media_gallery_assets_ordinal", sql`${table.ordinal} BETWEEN 0 AND 4`),
  ],
);

export const mediaCommandReceipts = mediaSchema.table(
  "command_receipts",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 128 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
    responseEtag: varchar("response_etag", { length: 32 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("media_receipts_actor_scope_key_uidx").on(table.actorUserAccountId, table.scope, table.keyHash),
    index("media_receipts_expires_idx").on(table.expiresAt),
    check("media_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
    check("media_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
    check("media_receipts_success", sql`${table.responseStatus} BETWEEN 200 AND 299`),
    check("media_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const mediaOutbox = mediaSchema.table(
  "outbox",
  {
    id: uuid("id").primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 32 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
    requestId: uuid("request_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    status: mediaOutboxStatus("status").default("PENDING").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    deliveredAt: timestamptz("delivered_at"),
  },
  (table) => [
    uniqueIndex("media_outbox_request_event_uidx").on(table.requestId, table.eventType),
    index("media_outbox_pending_idx").on(table.createdAt, table.id).where(sql`${table.status} = 'PENDING'`),
    check("media_outbox_revision_nonnegative", sql`${table.aggregateRevision} >= 0`),
    check("media_outbox_aggregate_type", sql`${table.aggregateType} IN ('HIGHLIGHT', 'GALLERY')`),
    check("media_outbox_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
    check("media_outbox_delivery", sql`(${table.status} = 'PENDING' AND ${table.deliveredAt} IS NULL) OR (${table.status} = 'DELIVERED' AND ${table.deliveredAt} IS NOT NULL)`),
  ],
);
