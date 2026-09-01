import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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
  const testFile = resolve(workspaceRoot, "tests/database/data-platform.contract.test.ts");
  const child = spawn(process.execPath, [tsxCli, "--test", testFile], {
    cwd: workspaceRoot,
    env: childTestEnvironment(connectionString),
    stdio: "inherit",
    windowsHide: true,
  });

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Database contract tests ended by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`Database contract tests failed with exit code ${exitCode}.`);
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
    return;
  }

  let cluster: EphemeralCluster | undefined;
  try {
    cluster = await startEphemeralCluster();
    process.stdout.write("[db-contract] isolated PostgreSQL 18 cluster started\n");
    await runContractTests(cluster.connectionString);
  } finally {
    if (cluster) {
      await stopAndRemoveCluster(cluster);
      process.stdout.write("[db-contract] cluster stopped and disposable workspace path removed\n");
    }
  }
}

await main();
