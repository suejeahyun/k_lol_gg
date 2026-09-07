import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { authSchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const userRole = authSchema.enum("user_role", ["USER", "ADMIN", "SUPER_ADMIN"]);
export const accountStatus = authSchema.enum("account_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
]);
export const sessionKind = authSchema.enum("session_kind", ["USER", "E2E_FIXTURE"]);
export const sessionPurpose = authSchema.enum("session_purpose", ["ACCOUNT", "ADMIN"]);
export const loginRateLimitScope = authSchema.enum("login_rate_limit_scope", [
  "LOGIN_ID_HASH",
  "IP_HASH",
  "GLOBAL_HASH",
]);
export const passwordResetRequestStatus = authSchema.enum("password_reset_request_status", [
  "PENDING",
  "RESOLVED",
  "CANCELLED",
  "EXPIRED",
]);

export const userAccounts = authSchema.table(
  "user_accounts",
  {
    id: uuid("id").primaryKey(),
    legacyId: integer("legacy_id"),
    loginId: varchar("login_id", { length: 64 }).notNull(),
    loginIdNormalized: varchar("login_id_normalized", { length: 64 }).notNull(),
    passwordHash: text("password_hash"),
    role: userRole("role").default("USER").notNull(),
    status: accountStatus("status").default("PENDING").notNull(),
    authVersion: integer("auth_version").default(0).notNull(),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    passwordChangedAt: timestamptz("password_changed_at"),
    statusChangedAt: timestamptz("status_changed_at"),
    statusReasonPublic: varchar("status_reason_public", { length: 500 }),
    statusReasonInternal: varchar("status_reason_internal", { length: 1000 }),
    termsAcceptedAt: timestamptz("terms_accepted_at"),
    termsVersion: varchar("terms_version", { length: 32 }),
    privacyAcceptedAt: timestamptz("privacy_accepted_at"),
    privacyVersion: varchar("privacy_version", { length: 32 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    deletedAt: timestamptz("deleted_at"),
  },
  (table) => [
    uniqueIndex("user_accounts_legacy_id_uidx").on(table.legacyId),
    uniqueIndex("user_accounts_login_id_normalized_uidx").on(table.loginIdNormalized),
    index("user_accounts_status_role_idx").on(table.status, table.role),
    index("user_accounts_deleted_at_idx").on(table.deletedAt),
    check("user_accounts_auth_version_nonnegative", sql`${table.authVersion} >= 0`),
    check("user_accounts_revision_nonnegative", sql`${table.revision} >= 0`),
    check("user_accounts_legacy_id_positive", sql`${table.legacyId} IS NULL OR ${table.legacyId} > 0`),
    check(
      "user_accounts_login_id_normalized_nonempty",
      sql`char_length(${table.loginIdNormalized}) > 0`,
    ),
    check(
      "user_accounts_terms_evidence_consistency",
      sql`(
        (${table.termsAcceptedAt} IS NULL AND ${table.termsVersion} IS NULL)
        OR
        (${table.termsAcceptedAt} IS NOT NULL AND char_length(${table.termsVersion}) > 0)
      )`,
    ),
    check(
      "user_accounts_privacy_evidence_consistency",
      sql`(
        (${table.privacyAcceptedAt} IS NULL AND ${table.privacyVersion} IS NULL)
        OR
        (${table.privacyAcceptedAt} IS NOT NULL AND char_length(${table.privacyVersion}) > 0)
      )`,
    ),
  ],
);

export const adminTotpCredentials = authSchema.table(
  "admin_totp_credentials",
  {
    userAccountId: uuid("user_account_id")
      .primaryKey()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    secretCiphertext: bytea("secret_ciphertext").notNull(),
    secretIv: bytea("secret_iv").notNull(),
    secretAuthTag: bytea("secret_auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    enabledAt: timestamptz("enabled_at"),
    lastUsedStep: bigint("last_used_step", { mode: "number" }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("admin_totp_credentials_ciphertext_nonempty", sql`octet_length(${table.secretCiphertext}) > 0`),
    check("admin_totp_credentials_iv_12_bytes", sql`octet_length(${table.secretIv}) = 12`),
    check(
      "admin_totp_credentials_auth_tag_16_bytes",
      sql`octet_length(${table.secretAuthTag}) = 16`,
    ),
    check("admin_totp_credentials_key_version_positive", sql`${table.keyVersion} > 0`),
    check(
      "admin_totp_credentials_last_step_nonnegative",
      sql`${table.lastUsedStep} IS NULL OR ${table.lastUsedStep} >= 0`,
    ),
  ],
);

export const authSessions = authSchema.table(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    tokenHash: bytea("token_hash").notNull(),
    userAccountId: uuid("user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    authVersion: integer("auth_version").notNull(),
    role: userRole("role").notNull(),
    purpose: sessionPurpose("purpose").default("ACCOUNT").notNull(),
    totpVerifiedAt: timestamptz("totp_verified_at"),
    kind: sessionKind("kind").default("USER").notNull(),
    fixtureId: varchar("fixture_id", { length: 128 }),
    issuedAt: timestamptz("issued_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
  },
  (table) => [
    index("sessions_user_revoked_idx").on(table.userAccountId, table.revokedAt),
    index("sessions_expires_at_idx").on(table.expiresAt),
    uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
    check("sessions_token_hash_32_bytes", sql`octet_length(${table.tokenHash}) = 32`),
    check("sessions_auth_version_nonnegative", sql`${table.authVersion} >= 0`),
    check("sessions_expiry_after_issue", sql`${table.expiresAt} > ${table.issuedAt}`),
    check(
      "sessions_purpose_role_consistency",
      sql`(
        (${table.purpose} = 'ACCOUNT' AND ${table.totpVerifiedAt} IS NULL)
        OR
        (${table.purpose} = 'ADMIN' AND ${table.role} IN ('ADMIN', 'SUPER_ADMIN'))
      )`,
    ),
    check(
      "sessions_fixture_kind_consistency",
      sql`(
        (${table.kind} = 'E2E_FIXTURE' AND ${table.fixtureId} IS NOT NULL)
        OR
        (${table.kind} = 'USER' AND ${table.fixtureId} IS NULL)
      )`,
    ),
  ],
);

export const accountStatusHistory = authSchema.table(
  "account_status_history",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    userAccountId: uuid("user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    actorUserAccountId: uuid("actor_user_account_id").references(() => userAccounts.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    previousStatus: accountStatus("previous_status"),
    nextStatus: accountStatus("next_status").notNull(),
    publicReason: varchar("public_reason", { length: 500 }),
    internalReason: varchar("internal_reason", { length: 1000 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("account_status_history_account_created_idx").on(
      table.userAccountId,
      table.createdAt,
    ),
    index("account_status_history_actor_created_idx").on(
      table.actorUserAccountId,
      table.createdAt,
    ),
  ],
);

export const accountMutationReceipts = authSchema.table(
  "account_mutation_receipts",
  {
    actorUserAccountId: uuid("actor_user_account_id").references(() => userAccounts.id, {
      onDelete: "cascade",
    }),
    principalKeyHash: bytea("principal_key_hash").notNull(),
    scope: varchar("scope", { length: 128 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
    responseEtag: varchar("response_etag", { length: 32 }),
    oneTimeSecretIssued: boolean("one_time_secret_issued").default(false).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("account_mutation_receipts_principal_scope_key_uidx").on(
      table.principalKeyHash,
      table.scope,
      table.keyHash,
    ),
    index("account_mutation_receipts_expires_at_idx").on(table.expiresAt),
    check(
      "account_mutation_receipts_principal_hash_32_bytes",
      sql`octet_length(${table.principalKeyHash}) = 32`,
    ),
    check(
      "account_mutation_receipts_key_hash_32_bytes",
      sql`octet_length(${table.keyHash}) = 32`,
    ),
    check(
      "account_mutation_receipts_request_hash_32_bytes",
      sql`octet_length(${table.requestHash}) = 32`,
    ),
    check(
      "account_mutation_receipts_status_success",
      sql`${table.responseStatus} >= 200 AND ${table.responseStatus} <= 299`,
    ),
    check(
      "account_mutation_receipts_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const passwordResetRequests = authSchema.table(
  "password_reset_requests",
  {
    id: uuid("id").primaryKey(),
    userAccountId: uuid("user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    loginIdHash: bytea("login_id_hash").notNull(),
    status: passwordResetRequestStatus("status").default("PENDING").notNull(),
    requestedAt: timestamptz("requested_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    resolvedAt: timestamptz("resolved_at"),
    resolvedByUserAccountId: uuid("resolved_by_user_account_id").references(
      () => userAccounts.id,
      { onDelete: "restrict" },
    ),
  },
  (table) => [
    uniqueIndex("password_reset_requests_active_account_uidx")
      .on(table.userAccountId)
      .where(sql`${table.status} = 'PENDING'`),
    index("password_reset_requests_status_requested_idx").on(
      table.status,
      table.requestedAt,
    ),
    index("password_reset_requests_expires_at_idx").on(table.expiresAt),
    check(
      "password_reset_requests_login_hash_32_bytes",
      sql`octet_length(${table.loginIdHash}) = 32`,
    ),
    check(
      "password_reset_requests_expiry_after_request",
      sql`${table.expiresAt} > ${table.requestedAt}`,
    ),
    check(
      "password_reset_requests_resolution_after_request",
      sql`${table.resolvedAt} IS NULL OR ${table.resolvedAt} >= ${table.requestedAt}`,
    ),
    check(
      "password_reset_requests_resolution_consistency",
      sql`(
        (${table.status} = 'PENDING' AND ${table.resolvedAt} IS NULL AND ${table.resolvedByUserAccountId} IS NULL)
        OR
        (${table.status} = 'RESOLVED' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedByUserAccountId} IS NOT NULL)
        OR
        (${table.status} = 'CANCELLED' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedByUserAccountId} IS NOT NULL)
        OR
        (${table.status} = 'EXPIRED' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedByUserAccountId} IS NULL)
      )`,
    ),
  ],
);

export const loginRateLimitBuckets = authSchema.table(
  "login_rate_limit_buckets",
  {
    scope: loginRateLimitScope("scope").notNull(),
    keyHash: bytea("key_hash").notNull(),
    windowStartedAt: timestamptz("window_started_at").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    blockedUntil: timestamptz("blocked_until"),
    expiresAt: timestamptz("expires_at").notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("login_rate_limit_bucket_uidx").on(
      table.scope,
      table.keyHash,
      table.windowStartedAt,
    ),
    index("login_rate_limit_expires_at_idx").on(table.expiresAt),
    index("login_rate_limit_blocked_until_idx").on(table.blockedUntil),
    check("login_rate_limit_key_hash_32_bytes", sql`octet_length(${table.keyHash}) = 32`),
    check("login_rate_limit_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    check(
      "login_rate_limit_expiry_after_window",
      sql`${table.expiresAt} > ${table.windowStartedAt}`,
    ),
  ],
);
