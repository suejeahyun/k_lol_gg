import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { authSchema } from "./namespaces";
import { userAccounts, sessionPurpose } from "./auth";
import { communitySites } from "./community-sites";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

/** HUB only: the connector secret is never stored in recoverable form. */
export const communitySsoClients = authSchema.table("community_sso_clients", {
  siteId: uuid("site_id").primaryKey().references(() => communitySites.id, { onDelete: "restrict" }),
  secretHash: bytea("secret_hash").notNull(),
  revokedAt: timestamptz("revoked_at"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [check("community_sso_client_digest", sql`octet_length(${table.secretHash}) = 32`)]);

/** HUB only: destination, purpose and PKCE are bound before a code is issued. */
export const communitySsoCodes = authSchema.table("community_sso_codes", {
  id: uuid("id").primaryKey(),
  codeHash: bytea("code_hash").notNull(),
  siteId: uuid("site_id").notNull().references(() => communitySsoClients.siteId, { onDelete: "restrict" }),
  userAccountId: uuid("user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  authVersion: integer("auth_version").notNull(),
  purpose: sessionPurpose("purpose").notNull(),
  callbackUrl: varchar("callback_url", { length: 500 }).notNull(),
  codeChallenge: varchar("code_challenge", { length: 43 }).notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  consumedAt: timestamptz("consumed_at"),
}, (table) => [
  uniqueIndex("community_sso_code_digest_uidx").on(table.codeHash),
  index("community_sso_code_expiry_idx").on(table.expiresAt),
  check("community_sso_code_digest", sql`octet_length(${table.codeHash}) = 32`),
  check("community_sso_code_version", sql`${table.authVersion} >= 0`),
  check("community_sso_code_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  check("community_sso_code_challenge", sql`${table.codeChallenge} ~ '^[A-Za-z0-9_-]{43}$'`),
]);

/** Child only: existing accounts are linked only after both logins are verified. */
export const communitySsoIdentities = authSchema.table("community_sso_identities", {
  hubIssuer: varchar("hub_issuer", { length: 300 }).notNull(),
  hubSubject: uuid("hub_subject").notNull(),
  userAccountId: uuid("user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "community_sso_identity_pk", columns: [table.hubIssuer, table.hubSubject] }),
  uniqueIndex("community_sso_identity_account_uidx").on(table.userAccountId),
  check("community_sso_identity_issuer", sql`${table.hubIssuer} LIKE 'https://%' OR ${table.hubIssuer} LIKE 'http://localhost:%' OR ${table.hubIssuer} LIKE 'http://127.0.0.1:%'`),
]);
