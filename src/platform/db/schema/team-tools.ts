import { sql } from "drizzle-orm";
import {
  bigint,
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
import { teamToolsSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const teamBalanceDraftStatus = teamToolsSchema.enum("team_balance_draft_status", [
  "EVALUATED",
  "SAVED",
  "ARCHIVED",
]);
export const teamBalanceCandidateSource = teamToolsSchema.enum("team_balance_candidate_source", [
  "AUTO",
  "MANUAL",
]);
export const teamBalanceOutboxStatus = teamToolsSchema.enum("team_balance_outbox_status", [
  "PENDING",
  "DELIVERED",
]);

export const teamBalanceDrafts = teamToolsSchema.table(
  "team_balance_drafts",
  {
    id: uuid("id").primaryKey(),
    ownerUserAccountId: uuid("owner_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 120 }).notNull(),
    status: teamBalanceDraftStatus("status").default("EVALUATED").notNull(),
    evaluationRound: integer("evaluation_round").default(1).notNull(),
    ratingGeneration: bigint("rating_generation", { mode: "number" }),
    selectedCandidateSource: teamBalanceCandidateSource("selected_candidate_source"),
    selectedCandidateSignature: varchar("selected_candidate_signature", { length: 500 }),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdByUserAccountId: uuid("created_by_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    updatedByUserAccountId: uuid("updated_by_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    savedAt: timestamptz("saved_at"),
    archivedAt: timestamptz("archived_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("team_balance_drafts_owner_updated_idx").on(
      table.ownerUserAccountId,
      table.updatedAt.desc(),
      table.id,
    ),
    check("team_balance_drafts_title_nonempty", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`),
    check("team_balance_drafts_revision_nonnegative", sql`${table.revision} >= 0`),
    check("team_balance_drafts_evaluation_round_positive", sql`${table.evaluationRound} > 0`),
    check(
      "team_balance_drafts_selection_pair",
      sql`(${table.selectedCandidateSource} IS NULL) = (${table.selectedCandidateSignature} IS NULL)`,
    ),
    check(
      "team_balance_drafts_lifecycle_consistency",
      sql`(
        (${table.status} = 'EVALUATED' AND ${table.savedAt} IS NULL AND ${table.archivedAt} IS NULL)
        OR (${table.status} = 'SAVED' AND ${table.savedAt} IS NOT NULL AND ${table.archivedAt} IS NULL AND ${table.selectedCandidateSignature} IS NOT NULL)
        OR (${table.status} = 'ARCHIVED' AND ${table.archivedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const teamBalanceDraftParticipants = teamToolsSchema.table(
  "team_balance_draft_participants",
  {
    draftId: uuid("draft_id")
      .notNull()
      .references(() => teamBalanceDrafts.id, { onDelete: "restrict" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    displayNameSnapshot: varchar("display_name_snapshot", { length: 96 }).notNull(),
    eligiblePositionsJson: jsonb("eligible_positions_json")
      .$type<readonly Record<string, unknown>[]>()
      .notNull(),
    ratingSnapshotJson: jsonb("rating_snapshot_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.playerId] }),
    uniqueIndex("team_balance_participants_draft_ordinal_uidx").on(table.draftId, table.ordinal),
    check("team_balance_participants_ordinal_range", sql`${table.ordinal} BETWEEN 0 AND 9`),
    check(
      "team_balance_participants_eligible_array",
      sql`jsonb_typeof(${table.eligiblePositionsJson}) = 'array' AND jsonb_array_length(${table.eligiblePositionsJson}) BETWEEN 1 AND 5`,
    ),
    check("team_balance_participants_rating_object", sql`jsonb_typeof(${table.ratingSnapshotJson}) = 'object'`),
  ],
);

export const teamBalanceDraftCandidates = teamToolsSchema.table(
  "team_balance_draft_candidates",
  {
    id: uuid("id").primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => teamBalanceDrafts.id, { onDelete: "restrict" }),
    evaluationRound: integer("evaluation_round").notNull(),
    source: teamBalanceCandidateSource("source").notNull(),
    rank: integer("rank"),
    signature: varchar("signature", { length: 500 }).notNull(),
    assignmentsJson: jsonb("assignments_json")
      .$type<readonly Record<string, unknown>[]>()
      .notNull(),
    scoreJson: jsonb("score_json").$type<Record<string, unknown>>().notNull(),
    createdByUserAccountId: uuid("created_by_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("team_balance_candidates_round_signature_uidx").on(
      table.draftId,
      table.evaluationRound,
      table.signature,
    ),
    uniqueIndex("team_balance_candidates_auto_rank_uidx")
      .on(table.draftId, table.evaluationRound, table.rank)
      .where(sql`${table.source} = 'AUTO'`),
    index("team_balance_candidates_draft_round_idx").on(table.draftId, table.evaluationRound),
    check("team_balance_candidates_round_positive", sql`${table.evaluationRound} > 0`),
    check(
      "team_balance_candidates_source_rank",
      sql`(${table.source} = 'AUTO' AND ${table.rank} BETWEEN 1 AND 3) OR (${table.source} = 'MANUAL' AND ${table.rank} IS NULL)`,
    ),
    check(
      "team_balance_candidates_assignments_exact",
      sql`jsonb_typeof(${table.assignmentsJson}) = 'array' AND jsonb_array_length(${table.assignmentsJson}) = 10`,
    ),
    check("team_balance_candidates_score_object", sql`jsonb_typeof(${table.scoreJson}) = 'object'`),
  ],
);

export const teamBalanceCommandReceipts = teamToolsSchema.table(
  "team_balance_command_receipts",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
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
    uniqueIndex("team_balance_receipts_actor_scope_key_uidx").on(
      table.actorUserAccountId,
      table.scope,
      table.keyHash,
    ),
    index("team_balance_receipts_expires_idx").on(table.expiresAt),
    check("team_balance_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
    check("team_balance_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
    check("team_balance_receipts_status_success", sql`${table.responseStatus} BETWEEN 200 AND 299`),
    check("team_balance_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const teamBalanceOutbox = teamToolsSchema.table(
  "team_balance_outbox",
  {
    id: uuid("id").primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => teamBalanceDrafts.id, { onDelete: "restrict" }),
    draftRevision: bigint("draft_revision", { mode: "number" }).notNull(),
    requestId: uuid("request_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    status: teamBalanceOutboxStatus("status").default("PENDING").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    deliveredAt: timestamptz("delivered_at"),
  },
  (table) => [
    uniqueIndex("team_balance_outbox_request_uidx").on(table.requestId),
    index("team_balance_outbox_pending_idx")
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = 'PENDING'`),
    check("team_balance_outbox_revision_nonnegative", sql`${table.draftRevision} >= 0`),
    check("team_balance_outbox_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
    check(
      "team_balance_outbox_delivery_consistency",
      sql`(${table.status} = 'PENDING' AND ${table.deliveredAt} IS NULL) OR (${table.status} = 'DELIVERED' AND ${table.deliveredAt} IS NOT NULL)`,
    ),
  ],
);
