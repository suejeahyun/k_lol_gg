import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import * as policy from "../src/modules/community-sites/domain/publication-access";

test("publication HTTP boundary blocks direct reads and writes, permits only owner, and immediately observes activation or revocation", async () => {
  let publicationState = "AWAITING_OWNER", revoked = false, unavailable = false;
  let reads = 0;
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "../domain/publication-access": policy,
    "./runtime-site-configuration": { readRuntimeCommunitySiteConfiguration: async () => { reads++; if (unavailable) throw new Error("private-database-credentials"); return { publicationState, ownerUserAccountId: "owner" }; } },
    "@/modules/auth/infrastructure/runtime-session": { sessionCookieName: (purpose: string) => purpose, getRuntimeSessionFromToken: async (token: string, purpose: string) => revoked || !token ? null : ({ userId: token, purpose, source: "database", role: "SUPER_ADMIN", accountStatus: "APPROVED" }) },
  };
  const source = ts.transpileModule(readFileSync(new URL("../src/modules/community-sites/infrastructure/publication-access.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const output: { requireCommunityPublicationAccess?: (request: NextRequest) => Promise<Response | null> } = {};
  new Script(source).runInNewContext({ exports: output, require: (key: string) => { assert.ok(Object.hasOwn(dependencies, key), key); return dependencies[key]; }, Response, process: { env: { NODE_ENV: "production" } } });
  const gate = output.requireCommunityPublicationAccess!;
  const request = (path: string, method = "GET", cookie = "") => new NextRequest(`https://child.example${path}`, { method, headers: { cookie } });
  for (const [path, method] of [["/", "GET"], ["/api/players", "GET"], ["/api/auth/signup", "POST"], ["/api/recruits", "POST"], ["/api/cron/statistics", "GET"]]) assert.equal((await gate(request(path, method)))?.status, 403);
  assert.equal((await gate(request("/admin", "GET", "ADMIN=other")))?.status, 403);
  assert.equal(await gate(request("/admin", "GET", "ADMIN=owner")), null);
  assert.equal(await gate(request("/", "GET", "ACCOUNT=owner")), null);
  revoked = true; assert.equal((await gate(request("/admin", "GET", "ADMIN=owner")))?.status, 403);
  publicationState = "ACTIVE"; assert.equal(await gate(request("/")), null);
  unavailable = true;
  const response = await gate(request("/api/recruits", "POST")); assert.equal(response?.status, 503); assert.doesNotMatch(await response!.text(), /private|credentials/);
  const before = reads;
  assert.equal(await gate(request("/api/community-runtime")), null);
  assert.equal(await gate(request("/api/auth/community-sso/callback")), null);
  assert.equal(reads, before, "health and the auth backbone have their own fail-closed handlers");
});
