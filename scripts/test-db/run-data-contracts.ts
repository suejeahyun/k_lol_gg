import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { generateTotpCode } from "../../src/modules/auth/infrastructure/totp";
import { encryptTotpSecret } from "../../src/modules/auth/infrastructure/totp-envelope";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { parseTotpEncryptionKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const execFile = promisify(execFileCallback);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const disposableRoot = resolve(workspaceRoot, ".tmp/postgres-tests");
const postgresMajor = 18;
const contractScope = process.env.V2_DB_CONTRACT_SCOPE?.trim().toLocaleLowerCase("en-US") || "all";

if (
  contractScope !== "all" &&
  contractScope !== "matches" &&
  contractScope !== "statistics" &&
  contractScope !== "team-tools" &&
  contractScope !== "mmr" &&
  contractScope !== "recruiting" &&
  contractScope !== "media" &&
  contractScope !== "events" &&
  contractScope !== "destruction" &&
  contractScope !== "operations" &&
  contractScope !== "riot"
) {
  throw new Error("V2_DB_CONTRACT_SCOPE must be 'all', 'matches', 'statistics', 'team-tools', 'mmr', 'recruiting', 'media', 'events', 'destruction', 'operations', or 'riot'.");
}

type EphemeralCluster = Readonly<{
  connectionString: string;
  dataDirectory: string;
  pgCtl: string;
  runDirectory: string;
  toolEnvironment: NodeJS.ProcessEnv;
}>;

const safeEnvironmentNames = new Set([
  "ci",
  "comspec",
  "home",
  "lang",
  "lc_all",
  "localappdata",
  "path",
  "pathext",
  "systemdrive",
  "systemroot",
  "temp",
  "tmp",
  "userprofile",
  "windir",
]);

function safeProcessEnvironment(): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name, value]) => value !== undefined && safeEnvironmentNames.has(name.toLocaleLowerCase("en-US")),
    ),
  );
  return { ...environment, NODE_ENV: "test" } as NodeJS.ProcessEnv;
}

function postgresExecutable(name: "initdb" | "pg_ctl"): string {
  const explicitBin = process.env.PG_BIN_DIR;
  if (!explicitBin) return name;

  const suffix = process.platform === "win32" ? ".exe" : "";
  return join(resolve(explicitBin), `${name}${suffix}`);
}

function assertDisposableDirectory(candidate: string): string {
  const resolvedCandidate = resolve(candidate);
  const workspaceRelative = relative(workspaceRoot, resolvedCandidate);
  const disposableRelative = relative(disposableRoot, resolvedCandidate);

  if (
    !workspaceRelative ||
    workspaceRelative.startsWith("..") ||
    isAbsolute(workspaceRelative) ||
    !disposableRelative ||
    disposableRelative.startsWith("..") ||
    isAbsolute(disposableRelative) ||
    !basename(resolvedCandidate).startsWith("klol-v2-pg-")
  ) {
    throw new Error(`Refusing unsafe PostgreSQL test path: ${resolvedCandidate}`);
  }

  return resolvedCandidate;
}

async function availableLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to reserve a loopback port.")));
        return;
      }

      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
  });
}

async function assertPostgres18(initdb: string, environment: NodeJS.ProcessEnv): Promise<void> {
  const { stdout } = await execFile(initdb, ["--version"], {
    env: environment,
    windowsHide: true,
  });
  const major = Number.parseInt(stdout.match(/(\d+)(?:\.\d+)?/)?.[1] ?? "", 10);

  if (major !== postgresMajor) {
    throw new Error(`PostgreSQL ${postgresMajor} initdb is required; detected ${stdout.trim()}.`);
  }
}

async function runQuietProcess(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const child = spawn(executable, [...args], {
    env: environment,
    stdio: "ignore",
    windowsHide: true,
  });

  return new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${basename(executable)} ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
}

async function verifyStopped(pgCtl: string, dataDirectory: string, environment: NodeJS.ProcessEnv) {
  const status = await runQuietProcess(
    pgCtl,
    ["--pgdata", dataDirectory, "status"],
    environment,
  );
  if (status !== 3) {
    throw new Error(`PostgreSQL stop could not be verified (status ${status}).`);
  }
}

async function removeVerifiedStoppedDirectory(
  pgCtl: string,
  candidate: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const disposableDirectory = assertDisposableDirectory(candidate);
  const dataDirectory = resolve(disposableDirectory, "data");
  await verifyStopped(pgCtl, dataDirectory, environment);
  await rm(disposableDirectory, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
  await access(disposableDirectory).then(
    () => Promise.reject(new Error(`Disposable directory still exists: ${disposableDirectory}`)),
    () => undefined,
  );
}

async function cleanupStoppedStaleClusters(
  pgCtl: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const entries = await readdir(disposableRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("klol-v2-pg-")) continue;
    await removeVerifiedStoppedDirectory(pgCtl, resolve(disposableRoot, entry.name), environment);
  }
}

async function createTestDatabase(connection: {
  databaseName: string;
  password: string;
  port: number;
}): Promise<string> {
  if (!/^klol_v2_test_[a-z0-9_]+$/.test(connection.databaseName)) {
    throw new Error("Unsafe generated test database name.");
  }

  const adminPool = new Pool({
    host: "127.0.0.1",
    port: connection.port,
    user: "postgres",
    password: connection.password,
    database: "postgres",
    max: 1,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await adminPool.query(`CREATE DATABASE "${connection.databaseName}"`);
  } finally {
    await adminPool.end();
  }

  const url = new URL("postgresql://127.0.0.1");
  url.username = "postgres";
  url.password = connection.password;
  url.port = String(connection.port);
  url.pathname = `/${connection.databaseName}`;
  return url.toString();
}

async function createSiblingTestDatabase(connectionString: string): Promise<Readonly<{
  connectionString: string;
  dispose: () => Promise<void>;
}>> {
  const source = new URL(connectionString);
  const databaseName = `klol_v2_test_fresh_${randomBytes(8).toString("hex")}`;
  if (!/^klol_v2_test_fresh_[a-f0-9]{16}$/.test(databaseName)) {
    throw new Error("Unsafe generated fresh-install database name.");
  }

  const adminPool = new Pool({
    host: source.hostname,
    port: Number.parseInt(source.port || "5432", 10),
    user: decodeURIComponent(source.username),
    password: decodeURIComponent(source.password),
    database: "postgres",
    max: 1,
    connectionTimeoutMillis: 5_000,
  });

  let databaseCreated = false;
  async function dropCreatedDatabase() {
    if (!databaseCreated) return;
    await adminPool.query(
      `select pg_terminate_backend(pid)
         from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [databaseName],
    );
    await adminPool.query(`DROP DATABASE "${databaseName}"`);
    databaseCreated = false;
  }

  const freshUrl = new URL(connectionString);
  freshUrl.pathname = `/${databaseName}`;
  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    assertSafeTestDatabase({
      connectionString: freshUrl.toString(),
      nodeEnv: "test",
      testMode: "true",
    });
  } catch (error) {
    try {
      await dropCreatedDatabase();
    } finally {
      await adminPool.end();
    }
    throw error;
  }

  return {
    connectionString: freshUrl.toString(),
    async dispose() {
      try {
        await dropCreatedDatabase();
      } finally {
        await adminPool.end();
      }
    },
  };
}

async function startEphemeralCluster(): Promise<EphemeralCluster> {
  const toolEnvironment = safeProcessEnvironment();
  const initdb = postgresExecutable("initdb");
  const pgCtl = postgresExecutable("pg_ctl");
  await assertPostgres18(initdb, toolEnvironment);

  await mkdir(disposableRoot, { recursive: true });
  await cleanupStoppedStaleClusters(pgCtl, toolEnvironment);
  const runDirectory = assertDisposableDirectory(
    await mkdtemp(join(disposableRoot, `${sep}klol-v2-pg-`)),
  );
  const dataDirectory = resolve(runDirectory, "data");
  const passwordFile = resolve(runDirectory, "bootstrap-password.txt");
  const logFile = resolve(runDirectory, "postgres.log");
  const password = randomBytes(32).toString("base64url");
  const port = await availableLoopbackPort();
  let initialized = false;
  let serverStarted = false;

  try {
    await writeFile(passwordFile, `${password}\n`, { encoding: "utf8", mode: 0o600 });
    await execFile(
      initdb,
      [
        "--pgdata",
        dataDirectory,
        "--username",
        "postgres",
        "--encoding",
        "UTF8",
        "--auth-local",
        "trust",
        "--auth-host",
        "scram-sha-256",
        "--pwfile",
        passwordFile,
        "--no-instructions",
      ],
      { env: toolEnvironment, windowsHide: true },
    );
    initialized = true;
  } finally {
    await unlink(passwordFile).catch(() => undefined);
  }

  if (!initialized) {
    throw new Error("PostgreSQL test cluster initialization did not complete.");
  }

  try {
    const startExitCode = await runQuietProcess(
      pgCtl,
      [
        "--pgdata",
        dataDirectory,
        "--log",
        logFile,
        "--options",
        `-p ${port} -h 127.0.0.1 -c password_encryption=scram-sha-256`,
        "--wait",
        "start",
      ],
      toolEnvironment,
    );
    if (startExitCode !== 0) {
      throw new Error(`pg_ctl start failed with exit code ${startExitCode}.`);
    }
    serverStarted = true;

    const databaseName = `klol_v2_test_${randomBytes(8).toString("hex")}`;
    const connectionString = await createTestDatabase({ databaseName, password, port });
    assertSafeTestDatabase({
      connectionString,
      nodeEnv: "test",
      testMode: "true",
    });

    return { connectionString, dataDirectory, pgCtl, runDirectory, toolEnvironment };
  } catch (error) {
    const logTail = await readFile(logFile, "utf8")
      .then((contents) => contents.split(/\r?\n/).slice(-20).join("\n"))
      .catch(() => "PostgreSQL log unavailable.");
    if (serverStarted) {
      const stopExitCode = await runQuietProcess(
        pgCtl,
        ["--pgdata", dataDirectory, "--mode", "fast", "--wait", "stop"],
        toolEnvironment,
      );
      if (stopExitCode !== 0) {
        throw new Error(`Ephemeral PostgreSQL startup failed and cleanup stop failed.\n${logTail}`, {
          cause: error,
        });
      }
    }
    await removeVerifiedStoppedDirectory(pgCtl, runDirectory, toolEnvironment);
    throw new Error(`Ephemeral PostgreSQL startup failed.\n${logTail}`, { cause: error });
  }
}

async function stopAndRemoveCluster(cluster: EphemeralCluster): Promise<void> {
  const stopExitCode = await runQuietProcess(
    cluster.pgCtl,
    ["--pgdata", cluster.dataDirectory, "--mode", "fast", "--wait", "stop"],
    cluster.toolEnvironment,
  );
  if (stopExitCode !== 0) {
    throw new Error(
      `PostgreSQL stop failed with exit code ${stopExitCode}; retained ${cluster.runDirectory}.`,
    );
  }
  await removeVerifiedStoppedDirectory(
    cluster.pgCtl,
    cluster.runDirectory,
    cluster.toolEnvironment,
  );
}

function childTestEnvironment(connectionString: string): NodeJS.ProcessEnv {
  return {
    ...safeProcessEnvironment(),
    DATABASE_URL: connectionString,
    NODE_ENV: "test",
    TEST_DATABASE_URL: connectionString,
    V2_DB_TEST_MODE: "true",
  };
}

async function runContractTests(connectionString: string): Promise<void> {
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: "test",
    testMode: "true",
  });

  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const allTestFiles = [
    "tests/database/data-platform.contract.test.ts",
    "tests/database/auth-totp-lifecycle.contract.test.ts",
    "tests/database/player-admin.contract.test.ts",
    "tests/database/season-platform.contract.test.ts",
    "tests/database/account-lifecycle.contract.test.ts",
    "tests/database/match-snapshot.contract.test.ts",
    "tests/database/statistics-projection.contract.test.ts",
    "tests/database/media.contract.test.ts",
    "tests/database/team-balance-draft.contract.test.ts",
    "tests/database/mmr-projection.contract.test.ts",
    "tests/database/recruiting.contract.test.ts",
    "tests/database/event-competition.contract.test.ts",
    "tests/database/destruction-competition.contract.test.ts",
    "tests/database/operations.contract.test.ts",
    "tests/database/riot.contract.test.ts",
  ];
  const scopedTestFiles: Readonly<Record<string, readonly string[]>> = {
    matches: ["tests/database/match-snapshot.contract.test.ts"],
    statistics: ["tests/database/statistics-projection.contract.test.ts"],
    "team-tools": ["tests/database/team-balance-draft.contract.test.ts"],
    mmr: ["tests/database/mmr-projection.contract.test.ts"],
    recruiting: ["tests/database/recruiting.contract.test.ts"],
    media: ["tests/database/media.contract.test.ts"],
    events: ["tests/database/event-competition.contract.test.ts"],
    destruction: ["tests/database/destruction-competition.contract.test.ts"],
    operations: ["tests/database/operations.contract.test.ts"],
    riot: ["tests/database/riot.contract.test.ts"],
  };
  const testFiles = contractScope === "all" ? allTestFiles : scopedTestFiles[contractScope]!;
  for (const relativeTestFile of testFiles) {
    const child = spawn(process.execPath, [tsxCli, "--test", resolve(workspaceRoot, relativeTestFile)], {
      cwd: workspaceRoot,
      env: childTestEnvironment(connectionString),
      stdio: "inherit",
      windowsHide: true,
    });
    const exitCode = await new Promise<number>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) reject(new Error(`${relativeTestFile} ended by ${signal}.`));
        else resolveExit(code ?? 1);
      });
    });
    if (exitCode !== 0) {
      throw new Error(`${relativeTestFile} failed with exit code ${exitCode}.`);
    }
  }
}

async function runDurableAuthHttpVerification(connectionString: string): Promise<void> {
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: "test",
    testMode: "true",
  });

  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const verificationFile = resolve(workspaceRoot, "scripts/test-db/verify-durable-auth-http.ts");
  const child = spawn(process.execPath, [tsxCli, verificationFile], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Database auth HTTP verification ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Database auth HTTP verification failed with exit code ${exitCode}.`);
  }
}

async function runTotpLifecycleHttpVerification(connectionString: string): Promise<void> {
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: "test",
    testMode: "true",
  });

  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const verificationFile = resolve(workspaceRoot, "scripts/test-db/verify-totp-lifecycle-http.ts");
  const child = spawn(process.execPath, [tsxCli, verificationFile], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`TOTP lifecycle HTTP verification ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`TOTP lifecycle HTTP verification failed with exit code ${exitCode}.`);
  }
}

async function runPlayerAdminHttpVerification(connectionString: string): Promise<void> {
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: "test",
    testMode: "true",
  });

  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const verificationFile = resolve(workspaceRoot, "scripts/test-db/verify-player-admin-http.ts");
  const child = spawn(process.execPath, [tsxCli, verificationFile], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Player administrator HTTP verification ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Player administrator HTTP verification failed with exit code ${exitCode}.`);
  }
}

async function runSeasonHttpVerification(connectionString: string): Promise<void> {
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: "test",
    testMode: "true",
  });

  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const verificationFile = resolve(workspaceRoot, "scripts/test-db/verify-seasons-http.ts");
  const child = spawn(process.execPath, [tsxCli, verificationFile], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Season HTTP verification ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Season HTTP verification failed with exit code ${exitCode}.`);
  }
}

async function runFreshInstallContractTest(connectionString: string): Promise<void> {
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: "test",
    testMode: "true",
  });
  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const relativeTestFile = "tests/database/fresh-install.contract.test.ts";
  const child = spawn(process.execPath, [tsxCli, "--test", resolve(workspaceRoot, relativeTestFile)], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${relativeTestFile} ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) throw new Error(`${relativeTestFile} failed with exit code ${exitCode}.`);
}

async function runFreshThenUpgradeContractTests(connectionString: string): Promise<void> {
  const freshDatabase = await createSiblingTestDatabase(connectionString);
  try {
    await runFreshInstallContractTest(freshDatabase.connectionString);
  } finally {
    await freshDatabase.dispose();
  }
  await runContractTests(connectionString);
}

async function runAccountHttpVerification(connectionString: string): Promise<void> {
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: "test",
    testMode: "true",
  });

  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const verificationFile = resolve(workspaceRoot, "scripts/test-db/verify-account-http.ts");
  const child = spawn(process.execPath, [tsxCli, verificationFile], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Account HTTP verification ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Account HTTP verification failed with exit code ${exitCode}.`);
  }
}

function base32(value: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let encoded = "";
  for (let index = 0; index < bits.length; index += 5) {
    encoded += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return encoded;
}

async function runSeasonBrowserQaServer(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 2 });
  const actorId = randomUUID();
  const playerId = randomUUID();
  const seasonId = randomUUID();
  const applicationId = randomUUID();
  const suffix = randomBytes(4).toString("hex");
  const loginId = `browser_super_${suffix}`;
  const password = `${randomBytes(24).toString("base64url")}!Aa1`;
  const passwordHash = await hashPassword(password);
  const totpSecret = base32(randomBytes(20));
  const sessionKey = randomBytes(32);
  const totpKey = randomBytes(32);
  const rateLimitPepper = randomBytes(32).toString("base64url");
  const sessionKeysJson = JSON.stringify({
    current: "browser-qa-v1",
    keys: { "browser-qa-v1": sessionKey.toString("base64url") },
  });
  const totpKeysJson = JSON.stringify({
    current: 1,
    keys: { 1: totpKey.toString("base64url") },
  });
  const totpKeyring = parseTotpEncryptionKeyring(totpKeysJson);
  const actorTotpEnvelope = encryptTotpSecret(actorId, totpSecret, totpKeyring);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await pool.query(
    `insert into auth.user_accounts
       (id, login_id, login_id_normalized, password_hash, role, status,
        password_changed_at, status_changed_at)
     values ($1, $2::text, lower($2::text), $3, 'SUPER_ADMIN', 'APPROVED', clock_timestamp(), clock_timestamp())`,
    [actorId, loginId, passwordHash],
  );
  await pool.query(
    `insert into registry.players
       (id, user_account_id, member_name, member_name_normalized, nickname, nickname_normalized, tag_line, tag_line_normalized)
     values ($1, $2, $3, $3, $4::text, lower($4::text), 'S03', 's03')`,
    [playerId, actorId, "화면 검수 비공개 회원명", `Breeze${suffix}`],
  );
  await pool.query(
    `insert into auth.admin_totp_credentials
       (user_account_id, secret_ciphertext, secret_iv, secret_auth_tag, key_version, enabled_at)
     values ($1, $2, $3, $4, $5, clock_timestamp())`,
    [
      actorId,
      actorTotpEnvelope.secretCiphertext,
      actorTotpEnvelope.secretIv,
      actorTotpEnvelope.secretAuthTag,
      actorTotpEnvelope.keyVersion,
    ],
  );

  async function seedQaAccount(
    label: string,
    status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED",
    options: Readonly<{
      role?: "USER" | "ADMIN";
      deleted?: boolean;
      withPlayer?: boolean;
      playerStatus?: "ACTIVE" | "INACTIVE";
      lifecycleManaged?: boolean;
    }> = {},
  ) {
    const id = randomUUID();
    const targetPlayerId = randomUUID();
    const targetLoginId = `qa_${label}_${suffix}`;
    const targetRole = options.role ?? "USER";
    const deleted = options.deleted ?? false;
    const withPlayer = options.withPlayer ?? true;
    const playerStatus = options.playerStatus ?? "ACTIVE";
    await pool.query(
      `insert into auth.user_accounts
         (id, login_id, login_id_normalized, password_hash, role, status,
          status_changed_at, deleted_at)
       values ($1, $2::text, lower($2::text), $3, $4, $5, clock_timestamp(),
               case when $6::boolean then clock_timestamp() else null end)`,
      [id, targetLoginId, passwordHash, targetRole, status, deleted],
    );
    if (withPlayer) {
      const lifecycleManaged = options.lifecycleManaged ?? false;
      await pool.query(
        `insert into registry.players
           (id, user_account_id, member_name, member_name_normalized,
            nickname, nickname_normalized, tag_line, tag_line_normalized,
            status, deactivated_at, account_lifecycle_deactivated_at)
         values ($1, $2, $3::text, lower($3::text), $4::text, lower($4::text), 'QA', 'qa', $5,
                 case when $5::registry.player_status = 'INACTIVE' then clock_timestamp() else null end,
                 case when $6::boolean then clock_timestamp() else null end)`,
        [
          targetPlayerId,
          id,
          `QA ${label} 회원`,
          `Qa${label}${suffix}`,
          playerStatus,
          lifecycleManaged,
        ],
      );
    }
    return { id, loginId: targetLoginId, playerId: withPlayer ? targetPlayerId : null };
  }

  const pendingTarget = await seedQaAccount("pending", "PENDING", {
    playerStatus: "INACTIVE",
    lifecycleManaged: true,
  });
  const approvedTarget = await seedQaAccount("approved", "APPROVED");
  const rejectedTarget = await seedQaAccount("rejected", "REJECTED", {
    playerStatus: "INACTIVE",
    lifecycleManaged: true,
  });
  const suspendedTarget = await seedQaAccount("suspended", "SUSPENDED");
  const deletedTarget = await seedQaAccount("deleted", "REJECTED", {
    deleted: true,
    playerStatus: "INACTIVE",
    lifecycleManaged: true,
  });
  const adminTarget = await seedQaAccount("admin", "APPROVED", { role: "ADMIN" });
  const adminTargetSecret = base32(randomBytes(20));
  const adminTargetEnvelope = encryptTotpSecret(adminTarget.id, adminTargetSecret, totpKeyring);
  await pool.query(
    `insert into auth.admin_totp_credentials
       (user_account_id, secret_ciphertext, secret_iv, secret_auth_tag, key_version, enabled_at)
     values ($1, $2, $3, $4, $5, clock_timestamp())`,
    [
      adminTarget.id,
      adminTargetEnvelope.secretCiphertext,
      adminTargetEnvelope.secretIv,
      adminTargetEnvelope.secretAuthTag,
      adminTargetEnvelope.keyVersion,
    ],
  );
  const claimTarget = await seedQaAccount("claim", "PENDING", { withPlayer: false });
  const claimPlayerId = randomUUID();
  await pool.query(
    `insert into registry.players
       (id, member_name, member_name_normalized, nickname, nickname_normalized,
        tag_line, tag_line_normalized, status)
     values ($1, $2::text, lower($2::text), $3::text, lower($3::text), 'QA', 'qa', 'ACTIVE')`,
    [claimPlayerId, "기존 플레이어 회원명", `ClaimTarget${suffix}`],
  );
  await pool.query(
    `insert into registry.player_account_claims
       (id, user_account_id, player_id, status, requested_member_name,
        requested_riot_id, created_at, updated_at)
     values ($1, $2, $3, 'PENDING', $4, $5, clock_timestamp(), clock_timestamp())`,
    [randomUUID(), claimTarget.id, claimPlayerId, "가입자가 입력한 회원명", `ClaimTarget${suffix}#QA`],
  );
  await pool.query(
    `insert into auth.password_reset_requests
       (id, user_account_id, login_id_hash, status, requested_at, expires_at)
     values ($1, $2, $3, 'PENDING', clock_timestamp(), clock_timestamp() + interval '7 days')`,
    [randomUUID(), approvedTarget.id, randomBytes(32)],
  );
  await pool.query(
    `insert into competition.seasons
       (id, name, name_normalized, status, revision, activated_at, created_by_user_account_id, updated_by_user_account_id)
     values ($1, $2::text, lower($2::text), 'ACTIVE', 1, now(), $3, $3)`,
    [seasonId, `하늘바람 S03 ${suffix}`, actorId],
  );
  await pool.query(
    `insert into competition.season_applications
       (id, season_id, player_id, apply_date, recruit_no, main_position, sub_positions, status, source)
     values ($1, $2, $3, $4, 1, 'MID', array['SUP']::competition.season_application_position[], 'APPLIED', 'SITE')`,
    [applicationId, seasonId, playerId, today],
  );

  const port = await availableLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const nextBin = resolve(workspaceRoot, "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspaceRoot,
    env: {
      ...safeProcessEnvironment(),
      NODE_ENV: "development",
      DATABASE_URL: connectionString,
      NEXT_PUBLIC_SITE_URL: origin,
      V2_PUBLIC_ORIGIN: origin,
      SESSION_SIGNING_KEYS: sessionKeysJson,
      TOTP_ENCRYPTION_KEYS: totpKeysJson,
      V2_AUTH_RATE_LIMIT_PEPPER: rateLimitPepper,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      log = `${log}${chunk}`.slice(-12_000);
    });
  }

  try {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Browser QA Next.js exited (${child.exitCode}).`);
      try {
        if ((await fetch(`${origin}/applications`)).status === 200) break;
      } catch {
        // Listener is not ready yet.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    }
    if (Date.now() >= deadline) throw new Error("Browser QA Next.js did not become ready.");

    process.stdout.write(`[browser-qa-ready] ${JSON.stringify({
      origin,
      loginId,
      password,
      targets: {
        pending: pendingTarget,
        approved: approvedTarget,
        rejected: rejectedTarget,
        suspended: suspendedTarget,
        deleted: deletedTarget,
        admin: adminTarget,
        claim: claimTarget,
      },
    })}\n`);
    process.stdout.write("[browser-qa-command] code | empty | season-error | season-restore | account-error | account-restore | sessions-error | sessions-restore | bump-approved | stop\n");
    process.stdin.setEncoding("utf8");
    let buffer = "";
    let seasonTableRenamed = false;
    let claimTableRenamed = false;
    let sessionsTableRenamed = false;
    await new Promise<void>((resolveStop, reject) => {
      process.stdin.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const command = line.trim();
          if (command === "code") {
            process.stdout.write(`[browser-qa-totp] ${generateTotpCode(totpSecret, Math.floor(Date.now() / 30_000))}\n`);
          } else if (command === "empty") {
            void pool
              .query(
                `update competition.seasons
                    set status = 'ENDED', ended_at = now(), revision = revision + 1, updated_at = now()
                  where id = $1 and status = 'ACTIVE'`,
                [seasonId],
              )
              .then(() => process.stdout.write("[browser-qa-state] no active season\n"))
              .catch(reject);
          } else if (command === "season-error" && !seasonTableRenamed) {
            void pool
              .query(`alter table competition.seasons rename to seasons_s03_browser_error`)
              .then(() => {
                seasonTableRenamed = true;
                process.stdout.write("[browser-qa-state] season repository unavailable\n");
              })
              .catch(reject);
          } else if (command === "season-restore" && seasonTableRenamed) {
            void pool
              .query(`alter table competition.seasons_s03_browser_error rename to seasons`)
              .then(() => {
                seasonTableRenamed = false;
                process.stdout.write("[browser-qa-state] season repository restored\n");
              })
              .catch(reject);
          } else if (command === "account-error" && !claimTableRenamed) {
            void pool
              .query(`alter table registry.player_account_claims rename to player_account_claims_s01_browser_error`)
              .then(() => {
                claimTableRenamed = true;
                process.stdout.write("[browser-qa-state] account detail repository unavailable\n");
              })
              .catch(reject);
          } else if (command === "account-restore" && claimTableRenamed) {
            void pool
              .query(`alter table registry.player_account_claims_s01_browser_error rename to player_account_claims`)
              .then(() => {
                claimTableRenamed = false;
                process.stdout.write("[browser-qa-state] account detail repository restored\n");
              })
              .catch(reject);
          } else if (command === "sessions-error" && !sessionsTableRenamed) {
            void pool
              .query(`alter table auth.sessions rename to sessions_s01_browser_error`)
              .then(() => {
                sessionsTableRenamed = true;
                process.stdout.write("[browser-qa-state] session revocation repository unavailable\n");
              })
              .catch(reject);
          } else if (command === "sessions-restore" && sessionsTableRenamed) {
            void pool
              .query(`alter table auth.sessions_s01_browser_error rename to sessions`)
              .then(() => {
                sessionsTableRenamed = false;
                process.stdout.write("[browser-qa-state] session revocation repository restored\n");
              })
              .catch(reject);
          } else if (command === "bump-approved") {
            void pool
              .query(`update auth.user_accounts set revision = revision + 1, updated_at = clock_timestamp() where id = $1`, [approvedTarget.id])
              .then(() => process.stdout.write("[browser-qa-state] approved target revision bumped\n"))
              .catch(reject);
          } else if (command === "stop") {
            resolveStop();
          }
        }
      });
    });
    if (seasonTableRenamed) {
      await pool.query(`alter table competition.seasons_s03_browser_error rename to seasons`);
    }
    if (claimTableRenamed) {
      await pool.query(`alter table registry.player_account_claims_s01_browser_error rename to player_account_claims`);
    }
    if (sessionsTableRenamed) {
      await pool.query(`alter table auth.sessions_s01_browser_error rename to sessions`);
    }
  } catch (error) {
    const sanitized = log
      .replaceAll(password, "[synthetic-password]")
      .replaceAll(totpSecret, "[synthetic-totp]")
      .replaceAll(sessionKey.toString("base64url"), "[synthetic-session-secret]")
      .replaceAll(totpKey.toString("base64url"), "[synthetic-totp-key]")
      .replaceAll(rateLimitPepper, "[synthetic-rate-pepper]");
    process.stderr.write(`${sanitized}\n`);
    throw error;
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolveExit) => child.once("exit", resolveExit)),
        new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await pool.end();
  }
}

async function main(): Promise<void> {
  const useCiService =
    process.env.CI === "true" && process.env.V2_USE_CI_POSTGRES_SERVICE === "true";

  if (useCiService) {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error("CI PostgreSQL service requires TEST_DATABASE_URL.");
    assertSafeTestDatabase({
      connectionString,
      nodeEnv: process.env.NODE_ENV,
      testMode: process.env.V2_DB_TEST_MODE,
    });
    if (contractScope !== "all") {
      await runContractTests(connectionString);
      return;
    }
    await runFreshThenUpgradeContractTests(connectionString);
    if (
      process.env.V2_SEASON_BROWSER_QA_HOLD === "true" ||
      process.env.V2_ACCOUNT_BROWSER_QA_HOLD === "true"
    ) {
      await runSeasonBrowserQaServer(connectionString);
    } else {
      await runDurableAuthHttpVerification(connectionString);
      await runTotpLifecycleHttpVerification(connectionString);
      await runPlayerAdminHttpVerification(connectionString);
      await runSeasonHttpVerification(connectionString);
      await runAccountHttpVerification(connectionString);
    }
    return;
  }

  let cluster: EphemeralCluster | undefined;
  try {
    cluster = await startEphemeralCluster();
    process.stdout.write("[db-contract] isolated PostgreSQL 18 cluster started\n");
    if (contractScope !== "all") {
      await runContractTests(cluster.connectionString);
      return;
    }
    await runFreshThenUpgradeContractTests(cluster.connectionString);
    if (
      process.env.V2_SEASON_BROWSER_QA_HOLD === "true" ||
      process.env.V2_ACCOUNT_BROWSER_QA_HOLD === "true"
    ) {
      await runSeasonBrowserQaServer(cluster.connectionString);
    } else {
      await runDurableAuthHttpVerification(cluster.connectionString);
      await runTotpLifecycleHttpVerification(cluster.connectionString);
      await runPlayerAdminHttpVerification(cluster.connectionString);
      await runSeasonHttpVerification(cluster.connectionString);
      await runAccountHttpVerification(cluster.connectionString);
    }
  } finally {
    if (cluster) {
      await stopAndRemoveCluster(cluster);
      process.stdout.write("[db-contract] cluster stopped and disposable workspace path removed\n");
    }
  }
}

await main();
