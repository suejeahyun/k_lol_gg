import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildCapturePlan, discoverAppPages } from "./build-page-capture-plan.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const READY_PREFIX = "[browser-qa-ready] ";
const TOTP_PREFIX = "[browser-qa-totp] ";

export function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
    index += 1;
  }
  return values;
}

export function parseTaggedValue(line, prefix) {
  if (!line.startsWith(prefix)) return null;
  const value = line.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.trim()} emitted an empty value.`);
  return value;
}

export function parseReadyPayload(line) {
  const source = parseTaggedValue(line, READY_PREFIX);
  if (source === null) return null;
  const payload = JSON.parse(source);
  for (const key of ["origin", "loginId", "accountLoginId", "setupLoginId", "password", "fixtures"]) {
    if (!payload[key]) throw new Error(`Browser QA ready payload is missing ${key}.`);
  }
  return payload;
}

export function summarizeCaptureIndex(index, expectedTargets) {
  if (!index || !Array.isArray(index.routes)) throw new Error("Capture index must contain a routes array.");
  const issueRecords = index.routes.filter((route) => Array.isArray(route.issues) && route.issues.length > 0);
  return {
    expectedTargets,
    capturedTargets: index.routes.length,
    issueCount: issueRecords.reduce((total, route) => total + route.issues.length, 0),
    affectedTargets: issueRecords.length,
    passed: index.routes.length === expectedTargets && issueRecords.length === 0,
  };
}

function safeChildEnvironment(extra = {}) {
  const allowed = new Set([
    "APPDATA", "CI", "COMSPEC", "HOME", "LANG", "LC_ALL", "LOCALAPPDATA", "PATH",
    "PATHEXT", "PG_BIN_DIR", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "WINDIR",
  ]);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name, value]) => value !== undefined && allowed.has(name.toUpperCase())),
  );
  return { ...environment, NEXT_TELEMETRY_DISABLED: "1", ...extra };
}

function streamLines(stream, onLine) {
  stream.setEncoding("utf8");
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  });
  stream.on("end", () => {
    if (buffer) onLine(buffer);
  });
}

function waitForExit(child, label) {
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${label} ended by ${signal}.`));
      else if (code !== 0) reject(new Error(`${label} failed with exit code ${code ?? 1}.`));
      else resolveExit();
    });
  });
}

async function runStreaming(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: workspaceRoot,
    env: options.env ?? safeChildEnvironment(),
    stdio: [options.stdin ? "pipe" : "ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  if (options.stdin) child.stdin.end(options.stdin);
  await waitForExit(child, options.label ?? command);
}

function waitForDeferred(label, timeoutMs) {
  let resolveValue;
  let rejectValue;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolveValue = resolvePromise;
    rejectValue = rejectPromise;
  });
  const timeout = setTimeout(() => rejectValue(new Error(`Timed out waiting for ${label}.`)), timeoutMs);
  return {
    promise,
    resolve(value) {
      clearTimeout(timeout);
      resolveValue(value);
    },
    reject(error) {
      clearTimeout(timeout);
      rejectValue(error);
    },
  };
}

function integerArgument(args, name) {
  const raw = args.get(name);
  if (raw === undefined) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer.`);
  return value;
}

export async function main(argv = process.argv.slice(2)) {
  const args = readArguments(argv);
  const outputRoot = resolve(args.get("output") ?? resolve(workspaceRoot, ".tmp/full-page-qa"));
  const screenshotsDirectory = resolve(outputRoot, "screenshots");
  const fixturesPath = resolve(outputRoot, "fixtures.json");
  const planPath = resolve(outputRoot, "capture-plan.json");
  const summaryPath = resolve(outputRoot, "summary.json");
  const shouldBuild = args.get("build") !== "false";
  const expectedPages = integerArgument(args, "expected-pages");
  const expectedCaptures = integerArgument(args, "expected-captures");
  const chromePath = args.get("chrome") ?? process.env.V2_CHROME_PATH;
  await mkdir(screenshotsDirectory, { recursive: true });

  if (shouldBuild) {
    const nextCli = resolve(workspaceRoot, "node_modules/next/dist/bin/next");
    await runStreaming(process.execPath, [nextCli, "build"], {
      env: safeChildEnvironment({ NODE_ENV: "production" }),
      label: "release production build",
    });
  } else {
    await access(resolve(workspaceRoot, ".next/BUILD_ID"));
  }

  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const databaseHarness = resolve(workspaceRoot, "scripts/test-db/run-data-contracts.ts");
  const harness = spawn(process.execPath, [tsxCli, databaseHarness], {
    cwd: workspaceRoot,
    env: safeChildEnvironment({
      NODE_ENV: "test",
      V2_DB_TEST_MODE: "true",
      V2_DB_CONTRACT_SCOPE: "all",
      V2_SEASON_BROWSER_QA_HOLD: "true",
      V2_ACCOUNT_BROWSER_QA_HOLD: "true",
    }),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const ready = waitForDeferred("the isolated browser QA server", 8 * 60_000);
  let totp = null;
  const harnessExit = waitForExit(harness, "isolated browser QA harness").catch((error) => {
    ready.reject(error);
    if (totp) totp.reject(error);
    throw error;
  });
  streamLines(harness.stdout, (line) => {
    try {
      const payload = parseReadyPayload(line);
      if (payload) {
        ready.resolve(payload);
        return;
      }
      const code = parseTaggedValue(line, TOTP_PREFIX);
      if (code !== null) {
        if (totp) totp.resolve(code);
        return;
      }
      process.stdout.write(`${line}\n`);
    } catch (error) {
      ready.reject(error);
      if (totp) totp.reject(error);
    }
  });
  harness.stderr.pipe(process.stderr);

  let primaryError;
  try {
    const payload = await ready.promise;
    const pages = await discoverAppPages(resolve(workspaceRoot, "src/app"));
    const plan = buildCapturePlan(pages, payload.fixtures);
    if (expectedPages !== null && pages.length !== expectedPages) {
      throw new Error(`Page inventory drift: expected ${expectedPages}, discovered ${pages.length}.`);
    }
    if (expectedCaptures !== null && plan.length !== expectedCaptures) {
      throw new Error(`Capture inventory drift: expected ${expectedCaptures}, generated ${plan.length}.`);
    }
    await writeFile(fixturesPath, `${JSON.stringify(payload.fixtures, null, 2)}\n`);
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);

    totp = waitForDeferred("a synthetic TOTP code", 10_000);
    harness.stdin.write("code\n");
    const totpCode = await totp.promise;
    const captureScript = resolve(workspaceRoot, "scripts/capture-page-qa.mjs");
    const captureArgs = [
      captureScript,
      "--origin", payload.origin,
      "--routes", planPath,
      "--output", screenshotsDirectory,
      "--credentials-stdin", "true",
    ];
    if (chromePath) captureArgs.push("--chrome", chromePath);
    await runStreaming(process.execPath, captureArgs, {
      stdin: JSON.stringify({
        adminLoginId: payload.loginId,
        accountLoginId: payload.accountLoginId,
        setupLoginId: payload.setupLoginId,
        password: payload.password,
        totpCode,
      }),
      label: "full-page Chromium capture",
    });

    const captureIndex = JSON.parse(await readFile(resolve(screenshotsDirectory, "index.json"), "utf8"));
    const summary = {
      generatedAt: new Date().toISOString(),
      pages: pages.length,
      ...summarizeCaptureIndex(captureIndex, plan.length),
      sessions: Object.fromEntries([...new Set(plan.map((entry) => entry.session))].map(
        (session) => [session, plan.filter((entry) => entry.session === session).length],
      )),
      containsProductionData: false,
      credentialsPersisted: false,
    };
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.passed) {
      throw new Error(`Full-page QA failed: ${summary.capturedTargets}/${summary.expectedTargets} captures, ${summary.affectedTargets} affected targets.`);
    }
    process.stdout.write(`[full-page-qa] PASS ${pages.length} pages / ${plan.length} captures -> ${outputRoot}\n`);
    return summary;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (harness.exitCode === null) harness.stdin.write("stop\n");
    try {
      await Promise.race([
        harnessExit,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out stopping the isolated browser QA harness.")), 20_000)),
      ]);
    } catch (cleanupError) {
      if (!primaryError) throw cleanupError;
      process.stderr.write(`[full-page-qa] cleanup warning: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`);
      if (harness.exitCode === null) harness.kill("SIGKILL");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
