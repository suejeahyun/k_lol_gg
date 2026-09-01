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
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const execFile = promisify(execFileCallback);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const disposableRoot = resolve(workspaceRoot, ".tmp/postgres-tests");
const postgresMajor = 18;

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
  const testFiles = [
    "tests/database/data-platform.contract.test.ts",
    "tests/database/auth-totp-lifecycle.contract.test.ts",
    "tests/database/player-admin.contract.test.ts",
    "tests/database/season-platform.contract.test.ts",
  ];
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
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await pool.query(
    `insert into auth.user_accounts
       (id, login_id, login_id_normalized, password_hash, role, status)
     values ($1, $2, $2, '$argon2id$v=19$synthetic-browser-qa-only', 'ADMIN', 'APPROVED')`,
    [actorId, `browser_db_actor_${suffix}`],
  );
  await pool.query(
    `insert into registry.players
       (id, user_account_id, member_name, member_name_normalized, nickname, nickname_normalized, tag_line, tag_line_normalized)
     values ($1, $2, $3, $3, $4::text, lower($4::text), 'S03', 's03')`,
    [playerId, actorId, "화면 검수 비공개 회원명", `Breeze${suffix}`],
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

  const loginId = `browser_admin_${suffix}`;
  const password = `${randomBytes(24).toString("base64url")}!Aa1`;
  const totpSecret = base32(randomBytes(20));
  const sessionSecret = randomBytes(32).toString("base64url");
  const port = await availableLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  const runnerToken = randomBytes(32).toString("base64url");
  const proofDirectory = resolve(workspaceRoot, ".tmp/auth-http", `season-browser-${suffix}`);
  const proofPath = resolve(proofDirectory, "fixture-proof.json");
  const proofCreatedAtMs = Date.now();
  await mkdir(proofDirectory, { recursive: true });
  await writeFile(
    proofPath,
    JSON.stringify({
      createdAtMs: proofCreatedAtMs,
      expiresAtMs: proofCreatedAtMs + 9 * 60_000,
      origin,
      runnerPid: process.pid,
      runnerToken,
    }),
    { encoding: "utf8", flag: "wx" },
  );
  const nextBin = resolve(workspaceRoot, "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspaceRoot,
    env: {
      ...safeProcessEnvironment(),
      NODE_ENV: "development",
      DATABASE_URL: connectionString,
      NEXT_PUBLIC_SITE_URL: origin,
      V2_PUBLIC_ORIGIN: origin,
      V2_TEST_AUTH_ENABLED: "true",
      V2_TEST_AUTH_PROOF_PATH: proofPath,
      V2_TEST_AUTH_RUNNER_PID: String(process.pid),
      V2_TEST_AUTH_RUNNER_TOKEN: runnerToken,
      V2_TEST_AUTH_SECRET: sessionSecret,
      V2_TEST_AUTH_FIXTURES_JSON: JSON.stringify([
        {
          id: actorId,
          loginId,
          password,
          role: "ADMIN",
          status: "APPROVED",
          authVersion: 1,
          adminTotpEnabled: true,
          adminTotpSecret: totpSecret,
        },
      ]),
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

    process.stdout.write(`[browser-qa-ready] ${JSON.stringify({ origin, loginId, password })}\n`);
    process.stdout.write("[browser-qa-command] code | empty | error | restore | stop\n");
    process.stdin.setEncoding("utf8");
    let buffer = "";
    let seasonTableRenamed = false;
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
          } else if (command === "error" && !seasonTableRenamed) {
            void pool
              .query(`alter table competition.seasons rename to seasons_s03_browser_error`)
              .then(() => {
                seasonTableRenamed = true;
                process.stdout.write("[browser-qa-state] season repository unavailable\n");
              })
              .catch(reject);
          } else if (command === "restore" && seasonTableRenamed) {
            void pool
              .query(`alter table competition.seasons_s03_browser_error rename to seasons`)
              .then(() => {
                seasonTableRenamed = false;
                process.stdout.write("[browser-qa-state] season repository restored\n");
              })
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
  } catch (error) {
    const sanitized = log
      .replaceAll(password, "[synthetic-password]")
      .replaceAll(totpSecret, "[synthetic-totp]")
      .replaceAll(sessionSecret, "[synthetic-session-secret]");
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
    await rm(proofDirectory, { force: true, recursive: true });
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
    await runContractTests(connectionString);
    if (process.env.V2_SEASON_BROWSER_QA_HOLD === "true") {
      await runSeasonBrowserQaServer(connectionString);
    } else {
      await runDurableAuthHttpVerification(connectionString);
      await runTotpLifecycleHttpVerification(connectionString);
      await runPlayerAdminHttpVerification(connectionString);
      await runSeasonHttpVerification(connectionString);
    }
    return;
  }

  let cluster: EphemeralCluster | undefined;
  try {
    cluster = await startEphemeralCluster();
    process.stdout.write("[db-contract] isolated PostgreSQL 18 cluster started\n");
    await runContractTests(cluster.connectionString);
    if (process.env.V2_SEASON_BROWSER_QA_HOLD === "true") {
      await runSeasonBrowserQaServer(cluster.connectionString);
    } else {
      await runDurableAuthHttpVerification(cluster.connectionString);
      await runTotpLifecycleHttpVerification(cluster.connectionString);
      await runPlayerAdminHttpVerification(cluster.connectionString);
      await runSeasonHttpVerification(cluster.connectionString);
    }
  } finally {
    if (cluster) {
      await stopAndRemoveCluster(cluster);
      process.stdout.write("[db-contract] cluster stopped and disposable workspace path removed\n");
    }
  }
}

await main();
