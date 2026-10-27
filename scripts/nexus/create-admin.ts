import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { normalizeLoginId, validateNewPassword } from "../../src/modules/accounts/domain/account-contracts";
import { nexusBootstrapTarget } from "./empty-database";

const target = nexusBootstrapTarget(process.env);
const loginId = process.env.NEXUS_ADMIN_LOGIN_ID?.trim();
const password = process.env.NEXUS_ADMIN_PASSWORD;
if (!loginId || !/^[a-zA-Z0-9_-]{4,64}$/.test(loginId) || !validateNewPassword(password)) {
  throw new Error("Supply NEXUS_ADMIN_LOGIN_ID (4–64 letters/digits/_/-) and NEXUS_ADMIN_PASSWORD (10–128 characters with a letter and digit) through the private environment.");
}
const passwordHash = await hashPassword(password);
const pool = new Pool({ connectionString: target.connectionString, max: 1, connectionTimeoutMillis: 5_000 });
try {
  await pool.query("begin");
  await pool.query("lock table auth.user_accounts in exclusive mode");
  const identity = (await pool.query("select brand_name from operations.site_settings where id = 1")).rows[0]?.brand_name;
  if (identity !== "NEXUS.GG") throw new Error("NEXUS initial administrator requires an initialized NEXUS database.");
  // Bot registrations are configuration and may already exist. Only a database
  // with no accounts is eligible; this command never promotes an existing user.
  const accountsExist = (await pool.query("select exists(select 1 from auth.user_accounts) as present")).rows[0].present;
  if (accountsExist) throw new Error("NEXUS initial administrator creation refused: an account already exists. Use the normal account administration flow.");
  await pool.query(`insert into auth.user_accounts
    (id, login_id, login_id_normalized, password_hash, role, status, must_change_password, password_changed_at, status_changed_at)
    values ($1, $2, $3, $4, 'SUPER_ADMIN', 'APPROVED', true, clock_timestamp(), clock_timestamp())`,
  [randomUUID(), loginId, normalizeLoginId(loginId), passwordHash]);
  await pool.query("commit");
  console.log("NEXUS initial administrator created. Sign in at /login, change the temporary password at /account/password, then sign in at /admin/login. No player, season, match, or recruitment data was created.");
} catch (error) {
  await pool.query("rollback");
  console.error(error instanceof Error && error.message.startsWith("NEXUS") ? error.message : "NEXUS initial administrator creation failed; no existing accounts were changed.");
  process.exitCode = 1;
} finally {
  delete process.env.NEXUS_ADMIN_PASSWORD;
  await pool.end();
}
