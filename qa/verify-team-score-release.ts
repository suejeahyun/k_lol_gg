import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const [originInput, deploymentId, expectedSha, output, cli] = process.argv.slice(2);
assert.ok(originInput && deploymentId && expectedSha && output && cli);
assert.match(deploymentId, /^dpl_[a-zA-Z0-9]+$/u);
assert.match(expectedSha, /^[a-f0-9]{40}$/u);
const origin = new URL(originInput);
assert.equal(origin.protocol, "https:");
assert.ok(origin.hostname === "k-lol-gg.vercel.app" || /^k-lol-[a-z0-9]+-tjdmswo11-3715s-projects\.vercel\.app$/u.test(origin.hostname));

function provider(args: string[]) {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  }));
}

// Only whitelisted metadata is persisted; provider responses can contain account metadata.
const deployment = provider(["api", `/v13/deployments/${deploymentId}`, "--raw"]);
assert.equal(deployment.id, deploymentId);
assert.equal(deployment.projectId, "prj_yeGD9GzHJk6pZCcIIjJ8grGPgW8q");
assert.equal(deployment.readyState, "READY");
assert.equal(deployment.target, "production");
assert.equal(deployment.meta.githubCommitSha, expectedSha);
if (origin.hostname === "k-lol-gg.vercel.app") {
  assert.equal(provider(["inspect", origin.origin, "--json"]).id, deploymentId, "canonical alias must point to the verified deployment");
} else assert.equal(deployment.url, origin.hostname);

const checks: { path: string; status: number }[] = [];
for (const [path, expectedStatus] of [
  ["/api/health", 200], ["/", 200], ["/tools/team-balance", 200], ["/admin/balance-ai", 307],
  ["/api/admin/balance-ai/team-overrides", 401], ["/api/admin/balance-ai/team-scores", 401], ["/api/cron/mmr-projection", 401],
] as const) {
  const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, expectedStatus, path);
  if (path === "/api/health") assert.equal((await response.json()).status, "ready");
  if (path.startsWith("/api/")) assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
  if (path === "/admin/balance-ai") assert.match(response.headers.get("location") ?? "", /\/admin\/login\?next=/u);
  checks.push({ path, status: response.status });
}

const result = {
  checkedAt: new Date().toISOString(), passed: true, deploymentId, sourceSha: expectedSha,
  readyState: deployment.readyState, immutableUrl: `https://${deployment.url}`, origin: origin.origin,
  canonicalAliasVerified: origin.hostname === "k-lol-gg.vercel.app", checks,
  notes: "Authenticated saves were verified only with isolated synthetic data. All live application requests were anonymous GET.",
};
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`PASS: ${checks.length} read-only checks; READY source ${expectedSha.slice(0, 8)}; ${origin.origin}\n`);
