import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
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
export const loginRateLimitScope = authSchema.enum("login_rate_limit_scope", [
  "LOGIN_ID_HASH",
  "IP_HASH",
  "GLOBAL_HASH",
]);

export const userAccounts = authSchema.table(
  "user_accounts",
  {
    id: uuid("id").primaryKey(),
    loginId: varchar("login_id", { length: 64 }).notNull(),
    loginIdNormalized: varchar("login_id_normalized", { length: 64 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").default("USER").notNull(),
    status: accountStatus("status").default("PENDING").notNull(),
    authVersion: integer("auth_version").default(0).notNull(),
    termsAcceptedAt: timestamptz("terms_accepted_at"),
    privacyAcceptedAt: timestamptz("privacy_accepted_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    deletedAt: timestamptz("deleted_at"),
  },
  (table) => [
    uniqueIndex("user_accounts_login_id_normalized_uidx").on(table.loginIdNormalized),
    index("user_accounts_status_role_idx").on(table.status, table.role),
    index("user_accounts_deleted_at_idx").on(table.deletedAt),
    check("user_accounts_auth_version_nonnegative", sql`${table.authVersion} >= 0`),
    check(
      "user_accounts_login_id_normalized_nonempty",
      sql`char_length(${table.loginIdNormalized}) > 0`,
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
      "sessions_fixture_kind_consistency",
      sql`(
        (${table.kind} = 'E2E_FIXTURE' AND ${table.fixtureId} IS NOT NULL)
        OR
        (${table.kind} = 'USER' AND ${table.fixtureId} IS NULL)
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
