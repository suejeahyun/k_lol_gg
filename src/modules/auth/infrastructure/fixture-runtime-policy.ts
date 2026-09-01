import { timingSafeEqual } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

type FixtureRuntimeEnvironment = Readonly<{
  NODE_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  V2_PUBLIC_ORIGIN?: string;
  V2_TEST_AUTH_ENABLED?: string;
  V2_TEST_AUTH_PROOF_PATH?: string;
  V2_TEST_AUTH_RUNNER_PID?: string;
  V2_TEST_AUTH_RUNNER_TOKEN?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
}>;

type FixtureRunnerProof = Readonly<{
  createdAtMs: number;
  expiresAtMs: number;
  origin: string;
  runnerPid: number;
  runnerToken: string;
}>;

type FixtureRuntimePolicyOptions = Readonly<{
  currentWorkingDirectory?: string;
  isRunnerAlive?: (runnerPid: number) => boolean;
  nowMs?: number;
}>;

const MAXIMUM_PROOF_BYTES = 4_096;
const MAXIMUM_PROOF_LIFETIME_MS = 10 * 60_000;
const MAXIMUM_CLOCK_SKEW_MS = 5_000;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function defaultRunnerLivenessCheck(runnerPid: number): boolean {
  try {
    process.kill(runnerPid, 0);
    return true;
  } catch {
    return false;
  }
}

function readFixtureRunnerProof(
  environment: FixtureRuntimeEnvironment,
  configuredOrigin: string,
  options: FixtureRuntimePolicyOptions,
): FixtureRunnerProof | null {
  const proofPath = environment.V2_TEST_AUTH_PROOF_PATH;
  const declaredRunnerPid = Number(environment.V2_TEST_AUTH_RUNNER_PID);
  const declaredRunnerToken = environment.V2_TEST_AUTH_RUNNER_TOKEN ?? "";
  if (
    !proofPath ||
    !isAbsolute(proofPath) ||
    basename(proofPath) !== "fixture-proof.json" ||
    !/^[1-9][0-9]*$/.test(environment.V2_TEST_AUTH_RUNNER_PID ?? "") ||
    !Number.isSafeInteger(declaredRunnerPid) ||
    declaredRunnerPid < 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(declaredRunnerToken)
  ) {
    return null;
  }

  try {
    const proofRoot = realpathSync(resolve(
      options.currentWorkingDirectory ?? process.cwd(),
      ".tmp",
      "auth-http",
    ));
    const canonicalProofPath = realpathSync(proofPath);
    const proofRelativePath = relative(proofRoot, canonicalProofPath);
    const proofStat = lstatSync(proofPath);
    if (
      !proofRelativePath ||
      proofRelativePath.startsWith("..") ||
      isAbsolute(proofRelativePath) ||
      proofStat.isSymbolicLink() ||
      !proofStat.isFile() ||
      proofStat.size < 2 ||
      proofStat.size > MAXIMUM_PROOF_BYTES
    ) {
      return null;
    }

    const parsed: unknown = JSON.parse(readFileSync(proofPath, "utf8"));
    if (!isPlainRecord(parsed) || Object.keys(parsed).length !== 5) return null;
    const proof = parsed as Partial<FixtureRunnerProof>;
    if (
      proof.origin !== configuredOrigin ||
      proof.runnerPid !== declaredRunnerPid ||
      typeof proof.runnerToken !== "string" ||
      !constantTimeEqual(proof.runnerToken, declaredRunnerToken) ||
      !Number.isSafeInteger(proof.createdAtMs) ||
      !Number.isSafeInteger(proof.expiresAtMs)
    ) {
      return null;
    }

    const nowMs = options.nowMs ?? Date.now();
    const createdAtMs = proof.createdAtMs as number;
    const expiresAtMs = proof.expiresAtMs as number;
    if (
      createdAtMs > nowMs + MAXIMUM_CLOCK_SKEW_MS ||
      expiresAtMs <= nowMs ||
      expiresAtMs <= createdAtMs ||
      expiresAtMs - createdAtMs > MAXIMUM_PROOF_LIFETIME_MS
    ) {
      return null;
    }

    const isRunnerAlive = options.isRunnerAlive ?? defaultRunnerLivenessCheck;
    return isRunnerAlive(declaredRunnerPid) ? proof as FixtureRunnerProof : null;
  } catch {
    return null;
  }
}

export function isFixtureAuthEnvironmentEnabled(
  environment: FixtureRuntimeEnvironment,
  options: FixtureRuntimePolicyOptions = {},
): boolean {
  if (
    environment.NODE_ENV !== "development" ||
    environment.V2_TEST_AUTH_ENABLED !== "true" ||
    environment.VERCEL ||
    environment.VERCEL_ENV ||
    environment.VERCEL_URL
  ) {
    return false;
  }

  const configuredOrigin = environment.V2_PUBLIC_ORIGIN ?? environment.NEXT_PUBLIC_SITE_URL;
  if (!configuredOrigin) return false;

  try {
    const origin = new URL(configuredOrigin);
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
    return (
      (origin.protocol === "http:" || origin.protocol === "https:") &&
      origin.origin === configuredOrigin &&
      loopbackHosts.has(origin.hostname) &&
      readFixtureRunnerProof(environment, configuredOrigin, options) !== null
    );
  } catch {
    return false;
  }
}
