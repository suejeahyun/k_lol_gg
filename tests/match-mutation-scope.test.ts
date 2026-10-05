import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import { canonicalSubmissionPublicCode } from "../src/modules/matches/domain/match";
import { idempotencyHashMaterial, readIdempotencyKey } from "../src/platform/http/idempotency";
import * as http from "../src/platform/http/index";
import * as matchDomain from "../src/modules/matches/domain/match";
import * as mutationGuard from "../src/modules/auth/application/mutation-request-guard";

test("owner Kakao image sessions retain canonical target codes while hashing stable request scopes", async () => {
  const prepared: Array<{ scope: string; material: Uint8Array }> = [];
  const commands: Array<{ targetReference: string; scope: string }> = [];
  const dependencies: Record<string, unknown> = {
    "node:crypto": { randomUUID },
    "@/platform/http": http,
    "@/modules/auth/domain/transaction-session": { transactionSessionActor: () => ({}) },
    "@/modules/matches": { canonicalSubmissionPublicCode },
    "@/modules/matches/infrastructure/match-http": {
      requireMatchApiSession: async () => ({ ok: true, session: {} }),
      matchNotFoundResponse: () => new Response(null, { status: 404 }),
      prepareMatchJsonMutation: async (request: Request, scope: string) => {
        const key = readIdempotencyKey(request.headers);
        assert.ok(key.ok);
        prepared.push({ scope, material: idempotencyHashMaterial(key.key, scope) });
        return { ok: true, expectedRevision: 0, requestKey: key.key.normalized, bodyDigestHex: "synthetic", body: await request.json() };
      },
    },
    "@/modules/recruiting/kakao-assistant/domain": {
      parseKakaoImageSessionBody: (body: unknown) => body,
      parseKakaoImageSessionRevokeBody: (body: unknown) => body,
    },
    "@/modules/recruiting/kakao-assistant/http": {
      kakaoImageSessionResponse: () => Response.json({ ok: true }),
      kakaoOwnerImageSessionErrorResponse: (error: Error) => { throw error; },
    },
    "@/modules/recruiting/kakao-assistant/runtime": {
      getRuntimeKakaoImageReceive: () => ({
        createOwnerSession: async (command: { targetReference: string; scope: string }) => commands.push(command),
        revokeOwnerSession: async (command: { targetReference: string; scope: string }) => commands.push(command),
      }),
    },
    "@/modules/recruiting/kakao-admin/runtime": { isRuntimeKakaoFeatureEnabled: async () => true },
    "@/modules/operations/infrastructure/site-feature-access": { requireSiteFeature: async () => null },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/app/api/me/match-submissions/[code]/kakao-session/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, (request: Request, context: { params: Promise<{ code: string }> }) => Promise<Response>> = {};
  vm.runInNewContext(compiled, { exports, require: (specifier: string) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  const key = randomUUID();
  const request = () => new Request("https://test.invalid/api/me/match-submissions/test/kakao-session", {
    method: "POST", headers: { "idempotency-key": key, "content-type": "application/json" }, body: "{}",
  });
  const firstCode = "MR2A1B2C3D4E5F60708", secondCode = "MR20123456789ABCDEF";
  for (const [code, method] of [[firstCode, "POST"], [firstCode, "POST"], [firstCode, "DELETE"], [secondCode, "POST"]]) {
    assert.equal((await exports[method]!(request(), { params: Promise.resolve({ code }) })).status, 200);
  }
  assert.deepEqual(prepared[0]!.material, prepared[1]!.material, "same request scope must replay");
  assert.notDeepEqual(prepared[0]!.material, prepared[2]!.material, "create and revoke must remain separate");
  assert.notDeepEqual(prepared[0]!.material, prepared[3]!.material, "different submissions must remain separate");
  assert.equal(commands[0]!.targetReference, firstCode);
  assert.equal(commands[0]!.scope, `me:match-submissions:${firstCode.toLowerCase()}:kakao-session:create`);
  for (const code of ["invalid!", firstCode.toLowerCase()]) {
    assert.equal((await exports.POST!(request(), { params: Promise.resolve({ code }) })).status, 404);
  }
  assert.equal(prepared.length, 4, "invalid codes must not reach hashing or mutate a session");
});

test("match JSON and image mutation headers reject malformed scopes with recoverable input problems", async () => {
  const dependencies: Record<string, unknown> = {
    "node:crypto": await import("node:crypto"),
    "@/modules/auth/application/mutation-request-guard": mutationGuard,
    "@/modules/auth/infrastructure/rate-limit-client-key": { resolveRateLimitClientKey: () => "isolated-test" },
    "@/modules/auth/infrastructure/server-authorization": {},
    "@/platform/http": http,
    "../domain/match": matchDomain,
    "./match-upload-body": {},
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/modules/matches/infrastructure/match-http.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  type Prepared = { ok: boolean; response?: Response; context?: { idempotencyMaterial: Uint8Array } };
  const exports: {
    prepareMatchJsonMutation?: (request: Request, scope: string, session: unknown, purpose: string) => Promise<Prepared>;
    prepareMatchUploadHeaders?: (request: Request, scope: string, session: unknown, submissionId: string) => Prepared;
  } = {};
  vm.runInNewContext(compiled, { exports, URL, TextEncoder, process: { env: {} }, require: (specifier: string) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  const key = randomUUID();
  const session = { userId: randomUUID(), sessionId: randomUUID() };
  const request = () => new Request("https://test.invalid/api/admin/matches/test/publish", { method: "POST", headers: {
    origin: "https://test.invalid", "idempotency-key": key, "if-match": '"0"', "content-type": "application/json",
  }, body: "{}" });
  for (const id of ["잘못된주소", "BAD-IDENTIFIER", "x".repeat(130)]) {
    for (const result of [
      await exports.prepareMatchJsonMutation!(request(), `admin:matches:${id}:publish`, session, "ADMIN"),
      exports.prepareMatchUploadHeaders!(request(), `admin:match-submissions:${id}:images`, session, randomUUID()),
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.response?.status, 400);
      assert.equal((await result.response!.json() as { code: string }).code, "INVALID_INPUT");
      assert.match(result.response!.headers.get("cache-control") ?? "", /no-store/);
    }
  }
  const validScope = `admin:matches:${randomUUID()}:publish`;
  const valid = await exports.prepareMatchJsonMutation!(request(), validScope, session, "ADMIN");
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.context?.idempotencyMaterial, idempotencyHashMaterial({ normalized: key }, validScope), "existing valid request hashes must stay unchanged");
});
