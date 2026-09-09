import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  uniqueIndex,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { privateAssets } from "./matches";
import { recruitingSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const recruitPartyType = recruitingSchema.enum("party_type", [
  "FLEX_RANK", "NORMAL_GAME", "SOLO_RANK", "ARAM", "TFT_NORMAL", "TFT_RANK",
  "DOUBLE_UP", "PARTY_NUMBER", "PARTY_RIFT", "OTHER_GAME",
]);
export const recruitPartyStatus = recruitingSchema.enum("party_status", [
  "DRAFT", "IN_PROGRESS", "FINISHED", "CANCELED", "RESET",
]);
export const scrimRecruitStatus = recruitingSchema.enum("scrim_status", [
  "RECRUITING", "MATCHED", "CONFIRMED", "COMPLETED", "CANCELED",
]);
export const recruitingOutboxStatus = recruitingSchema.enum("outbox_status", ["PENDING", "DELIVERED"]);
export const operationFormType = recruitingSchema.enum("operation_form_type", ["friends", "leaves", "meetups", "suggestions"]);
export const operationFormStatus = recruitingSchema.enum("operation_form_status", ["PENDING", "IN_REVIEW", "COMPLETED", "REJECTED", "CANCELLED"]);
export const kakaoRoomStatus = recruitingSchema.enum("kakao_room_status", ["ACTIVE", "PAUSED", "REVOKED"]);
export const kakaoRoomMemberRole = recruitingSchema.enum("kakao_room_member_role", ["MEMBER", "MANAGER", "ADMIN"]);
export const kakaoRoomRegistrationSource = recruitingSchema.enum("kakao_room_registration_source", ["BOOTSTRAP", "PAIRING", "ADMIN"]);
export const kakaoBotInstallationStatus = recruitingSchema.enum("kakao_bot_installation_status", ["ACTIVE", "REVOKED"]);
export const kakaoImageTargetType = recruitingSchema.enum("kakao_image_target_type", ["MATCH_SUBMISSION", "DISCIPLINE_TASK"]);
export const kakaoImageSessionStatus = recruitingSchema.enum("kakao_image_session_status", ["ACTIVE", "COMPLETE", "CANCELLED", "EXPIRED"]);
export const kakaoInboundImageStatus = recruitingSchema.enum("kakao_inbound_image_status", ["STAGED", "READY", "DELETE_PENDING"]);

export const recruitParties = recruitingSchema.table("parties", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  ownerUserAccountId: uuid("owner_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  sourceRoomId: varchar("source_room_id", { length: 128 }),
  sourceSenderId: varchar("source_sender_id", { length: 128 }),
  recruitDate: date("recruit_date", { mode: "string" }).notNull(),
  resetSequence: integer("reset_sequence").default(0).notNull(),
  recruitNumber: integer("recruit_number").notNull(),
  type: recruitPartyType("type").notNull(),
  status: recruitPartyStatus("status").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  maximumMembers: integer("maximum_members").notNull(),
  membersJson: jsonb("members_json").$type<readonly Record<string, unknown>[]>().notNull(),
  startTimeText: varchar("start_time_text", { length: 160 }).default("미정").notNull(),
  gameInfo: varchar("game_info", { length: 500 }).default("미입력").notNull(),
  scheduledStartAt: timestamptz("scheduled_start_at"),
  protectedUntil: timestamptz("protected_until"),
  lastActivityAt: timestamptz("last_activity_at").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("recruit_parties_date_reset_number_uidx").on(table.recruitDate, table.resetSequence, table.recruitNumber),
  index("recruit_parties_public_idx").on(table.status, table.recruitDate, table.recruitNumber),
  index("recruit_parties_owner_idx").on(table.ownerUserAccountId, table.updatedAt),
  check("recruit_parties_revision_nonnegative", sql`${table.revision} >= 0`),
  check("recruit_parties_reset_nonnegative", sql`${table.resetSequence} >= 0`),
  check("recruit_parties_number_range", sql`${table.recruitNumber} BETWEEN 1 AND 99`),
  check("recruit_parties_capacity_range", sql`${table.maximumMembers} BETWEEN 1 AND 99`),
  check("recruit_parties_title_nonempty", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 160`),
  check("recruit_parties_members_array", sql`jsonb_typeof(${table.membersJson}) = 'array' AND jsonb_array_length(${table.membersJson}) <= 99`),
  check("recruit_parties_start_time_text", sql`char_length(btrim(${table.startTimeText})) BETWEEN 1 AND 160`),
  check("recruit_parties_game_info", sql`char_length(btrim(${table.gameInfo})) BETWEEN 1 AND 500`),
  check("recruit_parties_primary_capacity", sql`jsonb_array_length(jsonb_path_query_array(${table.membersJson}, '$[*] ? (@.substitute == false)')) <= ${table.maximumMembers}`),
  check("recruit_parties_source_room", sql`${table.sourceRoomId} IS NULL OR char_length(btrim(${table.sourceRoomId})) BETWEEN 1 AND 128`),
  check("recruit_parties_source_sender", sql`${table.sourceSenderId} IS NULL OR char_length(btrim(${table.sourceSenderId})) BETWEEN 1 AND 128`),
  check("recruit_parties_protection_order", sql`${table.protectedUntil} IS NULL OR ${table.scheduledStartAt} IS NULL OR ${table.protectedUntil} >= ${table.scheduledStartAt}`),
]);

export const scrimRecruits = recruitingSchema.table("scrims", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  ownerUserAccountId: uuid("owner_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  sourceRoomId: varchar("source_room_id", { length: 128 }),
  sourceSenderId: varchar("source_sender_id", { length: 128 }),
  opponentSenderId: varchar("opponent_sender_id", { length: 128 }),
  recruitDate: date("recruit_date", { mode: "string" }).notNull(),
  scrimNumber: integer("scrim_number").notNull(),
  tournamentId: uuid("tournament_id"),
  legacyTournamentNumber: integer("legacy_tournament_number"),
  requesterTeamId: uuid("requester_team_id"),
  opponentTeamId: uuid("opponent_team_id"),
  legacyTitle: varchar("legacy_title", { length: 160 }),
  requesterTeamName: varchar("requester_team_name", { length: 120 }),
  opponentTeamName: varchar("opponent_team_name", { length: 120 }),
  requesterLineupJson: jsonb("requester_lineup_json").$type<Readonly<Record<string, string | null>>>(),
  opponentLineupJson: jsonb("opponent_lineup_json").$type<Readonly<Record<string, string | null>>>(),
  legacyMemo: varchar("legacy_memo", { length: 500 }),
  legacySeriesRuleText: varchar("legacy_series_rule_text", { length: 160 }),
  status: scrimRecruitStatus("status").notNull(),
  scheduledAt: timestamptz("scheduled_at"),
  bestOf: integer("best_of"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("scrim_recruits_date_number_uidx").on(table.recruitDate, table.scrimNumber),
  index("scrim_recruits_public_idx").on(table.status, table.recruitDate, table.scrimNumber),
  index("scrim_recruits_owner_idx").on(table.ownerUserAccountId, table.updatedAt),
  check("scrim_recruits_revision_nonnegative", sql`${table.revision} >= 0`),
  check("scrim_recruits_number_range", sql`${table.scrimNumber} BETWEEN 1 AND 99`),
  check("scrim_recruits_tournament_identity", sql`${table.tournamentId} IS NOT NULL OR (${table.legacyTournamentNumber} IS NOT NULL AND ${table.legacyTournamentNumber} BETWEEN 1 AND 9999)`),
  check("scrim_recruits_legacy_tournament_number", sql`${table.legacyTournamentNumber} IS NULL OR ${table.legacyTournamentNumber} BETWEEN 1 AND 9999`),
  check("scrim_recruits_best_of", sql`${table.bestOf} IS NULL OR ${table.bestOf} IN (1, 3, 5)`),
  check("scrim_recruits_requester_identity", sql`${table.requesterTeamId} IS NOT NULL OR (${table.requesterTeamName} IS NOT NULL AND char_length(btrim(${table.requesterTeamName})) BETWEEN 1 AND 120)`),
  check("scrim_recruits_legacy_title", sql`${table.legacyTitle} IS NULL OR char_length(btrim(${table.legacyTitle})) BETWEEN 1 AND 160`),
  check("scrim_recruits_requester_name", sql`${table.requesterTeamName} IS NULL OR char_length(btrim(${table.requesterTeamName})) BETWEEN 1 AND 120`),
  check("scrim_recruits_opponent_name", sql`${table.opponentTeamName} IS NULL OR char_length(btrim(${table.opponentTeamName})) BETWEEN 1 AND 120`),
  check("scrim_recruits_requester_lineup", sql`${table.requesterLineupJson} IS NULL OR jsonb_typeof(${table.requesterLineupJson}) = 'object'`),
  check("scrim_recruits_opponent_lineup", sql`${table.opponentLineupJson} IS NULL OR jsonb_typeof(${table.opponentLineupJson}) = 'object'`),
  check("scrim_recruits_legacy_memo", sql`${table.legacyMemo} IS NULL OR char_length(btrim(${table.legacyMemo})) BETWEEN 1 AND 500`),
  check("scrim_recruits_legacy_series_rule", sql`${table.legacySeriesRuleText} IS NULL OR char_length(btrim(${table.legacySeriesRuleText})) BETWEEN 1 AND 160`),
  check("scrim_recruits_source_room", sql`${table.sourceRoomId} IS NULL OR char_length(btrim(${table.sourceRoomId})) BETWEEN 1 AND 128`),
  check("scrim_recruits_source_sender", sql`${table.sourceSenderId} IS NULL OR char_length(btrim(${table.sourceSenderId})) BETWEEN 1 AND 128`),
  check("scrim_recruits_opponent_sender", sql`${table.opponentSenderId} IS NULL OR char_length(btrim(${table.opponentSenderId})) BETWEEN 1 AND 128`),
  check("scrim_recruits_distinct_teams", sql`${table.opponentTeamId} IS NULL OR ${table.opponentTeamId} <> ${table.requesterTeamId}`),
  check("scrim_recruits_status_team_consistency", sql`(${table.status} = 'RECRUITING' AND ${table.opponentTeamId} IS NULL) OR (${table.status} <> 'RECRUITING')`),
]);

export const recruitingCommandReceipts = recruitingSchema.table("command_receipts", {
  id: uuid("id").primaryKey(),
  actorPrincipalId: varchar("actor_principal_id", { length: 160 }).notNull(),
  scope: varchar("scope", { length: 160 }).notNull(),
  keyHash: bytea("key_hash").notNull(),
  requestHash: bytea("request_hash").notNull(),
  bodyDigestHex: varchar("body_digest_hex", { length: 64 }).notNull(),
  responseStatus: integer("response_status"),
  responseJson: jsonb("response_json").$type<Record<string, unknown>>(),
  responseRevision: bigint("response_revision", { mode: "number" }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  uniqueIndex("recruiting_receipts_principal_scope_key_uidx").on(table.actorPrincipalId, table.scope, table.keyHash),
  index("recruiting_receipts_expiry_idx").on(table.expiresAt),
  check("recruiting_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
  check("recruiting_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
  check("recruiting_receipts_body_digest", sql`${table.bodyDigestHex} ~ '^[a-f0-9]{64}$'`),
  check("recruiting_receipts_result_consistency", sql`(${table.responseStatus} IS NULL AND ${table.responseJson} IS NULL AND ${table.responseRevision} IS NULL) OR (${table.responseStatus} BETWEEN 200 AND 299 AND ${table.responseJson} IS NOT NULL AND ${table.responseRevision} >= 0)`),
  check("recruiting_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const recruitingNonceBindings = recruitingSchema.table("nonce_bindings", {
  id: uuid("id").primaryKey(),
  actorKind: varchar("actor_kind", { length: 12 }).notNull(),
  actorPrincipalId: varchar("actor_principal_id", { length: 160 }).notNull(),
  nonceHash: bytea("nonce_hash").notNull(),
  bindingHash: bytea("binding_hash").notNull(),
  keyId: varchar("key_id", { length: 128 }).notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  uniqueIndex("recruiting_nonce_principal_hash_uidx").on(table.actorPrincipalId, table.nonceHash),
  index("recruiting_nonce_expiry_idx").on(table.expiresAt),
  check("recruiting_nonce_actor_kind", sql`${table.actorKind} IN ('BOT', 'JOB')`),
  check("recruiting_nonce_hash", sql`octet_length(${table.nonceHash}) = 32`),
  check("recruiting_nonce_binding_hash", sql`octet_length(${table.bindingHash}) = 32`),
  check("recruiting_nonce_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const kakaoImageSessions = recruitingSchema.table("kakao_image_sessions", {
  id: uuid("id").primaryKey(),
  createdByUserAccountId: uuid("created_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  targetType: kakaoImageTargetType("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  roomIdHash: bytea("room_id_hash").notNull(),
  senderIdHash: bytea("sender_id_hash").notNull(),
  expectedImageCount: integer("expected_image_count").notNull(),
  receivedImageCount: integer("received_image_count").default(0).notNull(),
  status: kakaoImageSessionStatus("status").default("ACTIVE").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  completedAt: timestamptz("completed_at"),
  cancelledAt: timestamptz("cancelled_at"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("kakao_image_sessions_active_sender_uidx").on(table.roomIdHash, table.senderIdHash).where(sql`${table.status} = 'ACTIVE'`),
  uniqueIndex("kakao_image_sessions_active_target_uidx").on(table.targetType, table.targetId).where(sql`${table.status} = 'ACTIVE'`),
  index("kakao_image_sessions_target_idx").on(table.targetType, table.targetId, table.status),
  index("kakao_image_sessions_expiry_idx").on(table.status, table.expiresAt),
  check("kakao_image_sessions_room_hash", sql`octet_length(${table.roomIdHash}) = 32`),
  check("kakao_image_sessions_sender_hash", sql`octet_length(${table.senderIdHash}) = 32`),
  check("kakao_image_sessions_expected_count", sql`${table.expectedImageCount} BETWEEN 1 AND 100`),
  check("kakao_image_sessions_received_count", sql`${table.receivedImageCount} BETWEEN 0 AND ${table.expectedImageCount}`),
  check("kakao_image_sessions_lifecycle", sql`(${table.status} = 'ACTIVE' AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL)
    OR (${table.status} = 'COMPLETE' AND ${table.completedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.receivedImageCount} = ${table.expectedImageCount})
    OR (${table.status} IN ('CANCELLED', 'EXPIRED') AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NOT NULL)`),
]);

export const kakaoInboundImages = recruitingSchema.table("kakao_inbound_images", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => kakaoImageSessions.id, { onDelete: "restrict" }),
  privateAssetId: uuid("private_asset_id").notNull().references(() => privateAssets.id, { onDelete: "restrict" }),
  imageNumber: integer("image_number").notNull(),
  requestDigest: bytea("request_digest").notNull(),
  sha256: bytea("sha256").notNull(),
  status: kakaoInboundImageStatus("status").default("STAGED").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  readyAt: timestamptz("ready_at"),
  deleteRequestedAt: timestamptz("delete_requested_at"),
}, (table) => [
  uniqueIndex("kakao_inbound_images_asset_uidx").on(table.privateAssetId),
  uniqueIndex("kakao_inbound_images_session_number_uidx").on(table.sessionId, table.imageNumber),
  uniqueIndex("kakao_inbound_images_session_sha_uidx").on(table.sessionId, table.sha256),
  uniqueIndex("kakao_inbound_images_request_digest_uidx").on(table.requestDigest),
  index("kakao_inbound_images_session_status_idx").on(table.sessionId, table.status),
  check("kakao_inbound_images_number", sql`${table.imageNumber} BETWEEN 1 AND 100`),
  check("kakao_inbound_images_request_digest", sql`octet_length(${table.requestDigest}) = 32`),
  check("kakao_inbound_images_sha", sql`octet_length(${table.sha256}) = 32`),
  check("kakao_inbound_images_lifecycle", sql`(${table.status} = 'STAGED' AND ${table.readyAt} IS NULL AND ${table.deleteRequestedAt} IS NULL)
    OR (${table.status} = 'READY' AND ${table.readyAt} IS NOT NULL AND ${table.deleteRequestedAt} IS NULL)
    OR (${table.status} = 'DELETE_PENDING' AND ${table.deleteRequestedAt} IS NOT NULL)`),
]);

export const kakaoOperationSettings = recruitingSchema.table("kakao_operation_settings", {
  id: integer("id").primaryKey().default(1),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  globalEnabled: boolean("global_enabled").default(true).notNull(),
  maintenanceMode: boolean("maintenance_mode").default(false).notNull(),
  playerSearchEnabled: boolean("player_search_enabled").default(true).notNull(),
  seasonApplicationsEnabled: boolean("season_applications_enabled").default(true).notNull(),
  imageReceiveEnabled: boolean("image_receive_enabled").default(true).notNull(),
  recruitingEnabled: boolean("recruiting_enabled").default(true).notNull(),
  scheduledNoticeEnabled: boolean("scheduled_notice_enabled").default(true).notNull(),
  maxMessageLength: integer("max_message_length").default(4000).notNull(),
  updatedByUserAccountId: uuid("updated_by_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  check("kakao_operation_settings_singleton", sql`${table.id} = 1`),
  check("kakao_operation_settings_revision_nonnegative", sql`${table.revision} >= 0`),
  check("kakao_operation_settings_max_message", sql`${table.maxMessageLength} BETWEEN 100 AND 10000`),
]);

export const kakaoRooms = recruitingSchema.table("kakao_rooms", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  status: kakaoRoomStatus("status").default("ACTIVE").notNull(),
  registrationSource: kakaoRoomRegistrationSource("registration_source").notNull(),
  policyVersion: integer("policy_version").default(1).notNull(),
  registeredByUserAccountId: uuid("registered_by_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  registeredAt: timestamptz("registered_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  index("kakao_rooms_status_idx").on(table.status, table.updatedAt),
  check("kakao_rooms_revision_nonnegative", sql`${table.revision} >= 0`),
  check("kakao_rooms_display_name", sql`char_length(btrim(${table.displayName})) BETWEEN 1 AND 120`),
  check("kakao_rooms_policy_version", sql`${table.policyVersion} BETWEEN 1 AND 1000000`),
]);

export const kakaoBotInstallations = recruitingSchema.table("kakao_bot_installations", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  publicId: varchar("public_id", { length: 128 }).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  status: kakaoBotInstallationStatus("status").default("ACTIVE").notNull(),
  firstSeenAt: timestamptz("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamptz("last_seen_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("kakao_bot_installations_public_uidx").on(table.publicId),
  index("kakao_bot_installations_status_idx").on(table.status, table.lastSeenAt),
  check("kakao_bot_installations_revision_nonnegative", sql`${table.revision} >= 0`),
  check("kakao_bot_installations_public", sql`char_length(btrim(${table.publicId})) BETWEEN 8 AND 128`),
  check("kakao_bot_installations_name", sql`char_length(btrim(${table.displayName})) BETWEEN 1 AND 120`),
]);

export const kakaoRoomBindings = recruitingSchema.table("kakao_room_bindings", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  installationId: uuid("installation_id").notNull().references(() => kakaoBotInstallations.id, { onDelete: "restrict" }),
  localRoomFingerprint: varchar("local_room_fingerprint", { length: 128 }).notNull(),
  roomId: uuid("room_id").notNull().references(() => kakaoRooms.id, { onDelete: "cascade" }),
  registrationSource: kakaoRoomRegistrationSource("registration_source").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("kakao_room_bindings_installation_local_uidx").on(table.installationId, table.localRoomFingerprint),
  index("kakao_room_bindings_room_idx").on(table.roomId, table.updatedAt),
  check("kakao_room_bindings_revision_nonnegative", sql`${table.revision} >= 0`),
  check("kakao_room_bindings_local", sql`char_length(btrim(${table.localRoomFingerprint})) BETWEEN 8 AND 128`),
]);

export const kakaoRoomMembers = recruitingSchema.table("kakao_room_members", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  roomId: uuid("room_id").notNull().references(() => kakaoRooms.id, { onDelete: "cascade" }),
  senderFingerprint: varchar("sender_fingerprint", { length: 128 }).notNull(),
  linkedUserAccountId: uuid("linked_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  linkedPlayerId: uuid("linked_player_id").references(() => players.id, { onDelete: "set null" }),
  role: kakaoRoomMemberRole("role").default("MEMBER").notNull(),
  lastActivityAt: timestamptz("last_activity_at").defaultNow().notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("kakao_room_members_room_sender_uidx").on(table.roomId, table.senderFingerprint),
  index("kakao_room_members_room_role_idx").on(table.roomId, table.role, table.updatedAt),
  index("kakao_room_members_user_idx").on(table.linkedUserAccountId),
  check("kakao_room_members_revision_nonnegative", sql`${table.revision} >= 0`),
  check("kakao_room_members_sender", sql`char_length(btrim(${table.senderFingerprint})) BETWEEN 8 AND 128`),
]);

export const kakaoRoomPairings = recruitingSchema.table("kakao_room_pairings", {
  id: uuid("id").primaryKey(),
  targetRoomId: uuid("target_room_id").references(() => kakaoRooms.id, { onDelete: "restrict" }),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  codeHash: bytea("code_hash").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  consumedAt: timestamptz("consumed_at"),
  consumedRoomId: uuid("consumed_room_id").references(() => kakaoRooms.id, { onDelete: "restrict" }),
  consumedInstallationId: uuid("consumed_installation_id").references(() => kakaoBotInstallations.id, { onDelete: "restrict" }),
  consumedLocalRoomFingerprint: varchar("consumed_local_room_fingerprint", { length: 128 }),
  consumedSenderFingerprint: varchar("consumed_sender_fingerprint", { length: 128 }),
  consumedRequestKeyHash: bytea("consumed_request_key_hash"),
  createdByUserAccountId: uuid("created_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("kakao_room_pairings_code_uidx").on(table.codeHash),
  index("kakao_room_pairings_expiry_idx").on(table.expiresAt, table.consumedAt),
  check("kakao_room_pairings_code_hash", sql`octet_length(${table.codeHash}) = 32`),
  check("kakao_room_pairings_name", sql`char_length(btrim(${table.displayName})) BETWEEN 1 AND 120`),
  check("kakao_room_pairings_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  check("kakao_room_pairings_local", sql`${table.consumedLocalRoomFingerprint} IS NULL OR char_length(btrim(${table.consumedLocalRoomFingerprint})) BETWEEN 8 AND 128`),
  check("kakao_room_pairings_sender", sql`${table.consumedSenderFingerprint} IS NULL OR char_length(btrim(${table.consumedSenderFingerprint})) BETWEEN 8 AND 128`),
  check("kakao_room_pairings_request_key", sql`${table.consumedRequestKeyHash} IS NULL OR octet_length(${table.consumedRequestKeyHash}) = 32`),
  check("kakao_room_pairings_consumption", sql`(${table.consumedAt} IS NULL AND ${table.consumedRoomId} IS NULL AND ${table.consumedInstallationId} IS NULL AND ${table.consumedLocalRoomFingerprint} IS NULL AND ${table.consumedSenderFingerprint} IS NULL AND ${table.consumedRequestKeyHash} IS NULL) OR (${table.consumedAt} IS NOT NULL AND ${table.consumedRoomId} IS NOT NULL AND ${table.consumedInstallationId} IS NOT NULL AND ${table.consumedLocalRoomFingerprint} IS NOT NULL AND ${table.consumedSenderFingerprint} IS NOT NULL AND ${table.consumedRequestKeyHash} IS NOT NULL)`),
]);

export const operationForms = recruitingSchema.table("operation_forms", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  formType: operationFormType("form_type").notNull(),
  status: operationFormStatus("status").default("PENDING").notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  sourceRoomId: varchar("source_room_id", { length: 128 }).notNull(),
  sourceSenderId: varchar("source_sender_id", { length: 128 }).notNull(),
  adminNote: varchar("admin_note", { length: 2_000 }),
  reviewedByUserAccountId: uuid("reviewed_by_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  reviewedAt: timestamptz("reviewed_at"),
  deletedAt: timestamptz("deleted_at"),
  deletedByUserAccountId: uuid("deleted_by_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  deletionReason: varchar("deletion_reason", { length: 500 }),
  submittedAt: timestamptz("submitted_at").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  index("operation_forms_active_type_status_idx").on(table.formType, table.status, table.submittedAt.desc()).where(sql`${table.deletedAt} IS NULL`),
  index("operation_forms_active_submitted_idx").on(table.submittedAt.desc(), table.id).where(sql`${table.deletedAt} IS NULL`),
  check("operation_forms_revision_nonnegative", sql`${table.revision} >= 0`),
  check("operation_forms_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object' AND pg_column_size(${table.payloadJson}) <= 16384`),
  check("operation_forms_source_room_nonempty", sql`char_length(btrim(${table.sourceRoomId})) BETWEEN 1 AND 128`),
  check("operation_forms_source_sender_nonempty", sql`char_length(btrim(${table.sourceSenderId})) BETWEEN 1 AND 128`),
  check("operation_forms_review_consistency", sql`(${table.reviewedAt} IS NULL AND ${table.reviewedByUserAccountId} IS NULL) OR (${table.reviewedAt} IS NOT NULL AND ${table.reviewedByUserAccountId} IS NOT NULL)`),
  check("operation_forms_delete_consistency", sql`(${table.deletedAt} IS NULL AND ${table.deletedByUserAccountId} IS NULL AND ${table.deletionReason} IS NULL) OR (${table.deletedAt} IS NOT NULL AND ${table.deletedByUserAccountId} IS NOT NULL AND char_length(btrim(${table.deletionReason})) BETWEEN 1 AND 500)`),
]);

export const recruitingOutbox = recruitingSchema.table("outbox", {
  id: varchar("id", { length: 200 }).primaryKey(),
  requestId: uuid("request_id").notNull(),
  aggregateType: varchar("aggregate_type", { length: 32 }).notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
  eventType: varchar("event_type", { length: 96 }).notNull(),
  dedupeKey: varchar("dedupe_key", { length: 240 }).notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  status: recruitingOutboxStatus("status").default("PENDING").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  deliveredAt: timestamptz("delivered_at"),
}, (table) => [
  uniqueIndex("recruiting_outbox_request_uidx").on(table.requestId),
  uniqueIndex("recruiting_outbox_dedupe_uidx").on(table.dedupeKey),
  index("recruiting_outbox_pending_idx").on(table.createdAt, table.id).where(sql`${table.status} = 'PENDING'`),
  check("recruiting_outbox_aggregate_type", sql`${table.aggregateType} IN ('RECRUIT_PARTY', 'SCRIM_RECRUIT', 'OPERATION_FORM', 'KAKAO_IMAGE_SESSION', 'KAKAO_SETTINGS')`),
  check("recruiting_outbox_revision_nonnegative", sql`${table.aggregateRevision} >= 0`),
  check("recruiting_outbox_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
  check("recruiting_outbox_delivery_consistency", sql`(${table.status} = 'PENDING' AND ${table.deliveredAt} IS NULL) OR (${table.status} = 'DELIVERED' AND ${table.deliveredAt} IS NOT NULL)`),
]);
