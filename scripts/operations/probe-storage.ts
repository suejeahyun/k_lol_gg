import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { signJobRequest } from "../../src/modules/operations/infrastructure/job-signature";

const options = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]; const value = process.argv[i + 1];
  if (!key || !["--origin", "--secret-file", "--output"].includes(key) || !value || options.has(key)) throw new Error("INVALID_ARGUMENTS");
  options.set(key, value);
}
const origin = new URL(options.get("--origin") ?? "https://k-lol-gg.vercel.app");
if (origin.protocol !== "https:" || origin.username || origin.password || origin.port || origin.pathname !== "/" || origin.search || origin.hash ||
  !(origin.hostname === "k-lol-gg.vercel.app" || /^k-lol-[a-z0-9]+-tjdmswo11-3715s-projects\.vercel\.app$/u.test(origin.hostname))) throw new Error("UNAPPROVED_PROBE_ORIGIN");
const secret = options.has("--secret-file") ? readFileSync(options.get("--secret-file")!, "utf8").trim() : process.env.OPERATIONS_JOB_SECRET;
if (!secret || secret.length < 32 || secret.includes("[SENSITIVE]")) throw new Error("LOCAL_JOB_SECRET_REQUIRED");
const path = "/api/internal/jobs/storage-probe";
const body = "{}";
const signed = { method: "POST" as const, path, timestampSeconds: Math.floor(Date.now() / 1000), nonce: randomBytes(24).toString("hex"),
  bodyDigestHex: createHash("sha256").update(body).digest("hex") };
try {
  const response = await fetch(new URL(path, origin), { method: "POST", redirect: "error", body,
    headers: { "Content-Type": "application/json", "x-job-timestamp": String(signed.timestampSeconds), "x-job-nonce": signed.nonce,
      "x-job-signature": signJobRequest(signed, secret) }, signal: AbortSignal.timeout(65_000) });
  const result = await response.json();
  const report = { checkedAt: new Date().toISOString(), origin: origin.origin, httpStatus: response.status,
    traceId: response.headers.get("x-trace-id"), job: result.job, runId: result.runId, storageProvider: result.storageProvider,
    ok: result.ok === true, counts: result.counts, failureCode: result.failureCode ?? result.code ?? null,
    status: response.status === 200 && result.ok === true && result.storageProvider === "VERCEL_BLOB_PRIVATE" ? "PASS" : "FAIL" };
  const output = JSON.stringify(report, null, 2) + "\n";
  if (options.has("--output")) writeFileSync(options.get("--output")!, output);
  process.stdout.write(output);
  if (report.status !== "PASS") process.exitCode = 1;
} catch {
  process.stderr.write("STORAGE_PROBE_HTTP_FAILED: inspect provider status without printing credentials.\n");
  process.exitCode = 1;
}
