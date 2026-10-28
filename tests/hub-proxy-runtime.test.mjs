import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `
  import { NextRequest } from 'next/server';
  import { proxy, config } from './src/proxy.ts';
  import { ADMIN_REQUEST_PATH_HEADER } from './src/modules/auth/application/admin-request-path.ts';
  import { ADMIN_SESSION_COOKIE_NAME, ACCOUNT_SESSION_COOKIE_NAME } from './src/modules/auth/infrastructure/session-constants.ts';
  import { normalizeInternalNext, normalizeAccountNext } from './src/modules/auth/application/normalize-internal-next.ts';
  const calls = [['/admin?next=https://evil.invalid','GET'],['/account','GET'],['/api/admin/community-network','PUT'],['/api/kakao/v4/webhook','POST'],['/players','GET'],['/api/auth/password','PATCH'],['/admin/community-network','GET'],['/api/admin/community-network','DELETE']];
  process.stdout.write(JSON.stringify({
    matcher: config.matcher,
    adminCookie: ADMIN_SESSION_COOKIE_NAME,
    accountCookie: ACCOUNT_SESSION_COOKIE_NAME,
    next: [normalizeInternalNext('/admin/users'), normalizeInternalNext('/admin/community-network'), normalizeAccountNext('/players'), normalizeAccountNext('/account/password')],
    responses: await Promise.all(calls.map(async ([path,method]) => {
      const response = await proxy(new NextRequest('https://hub.example'+path, { method, headers: {[ADMIN_REQUEST_PATH_HEADER]: '/admin/users'} }));
      return {path,status:response.status,location:response.headers.get('location'),next:response.headers.get('x-middleware-next'),trustedPath:response.headers.get('x-middleware-request-'+ADMIN_REQUEST_PATH_HEADER),allow:response.headers.get('allow')};
    }))
  }));
`;

test("hub proxy applies to all paths, preserves trusted administrator path and uses separate cookies", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
    cwd: root, env: { ...process.env, NEXT_PUBLIC_SERVICE_ID: "hub", NEXT_PUBLIC_SITE_URL: "https://hub.example" }, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result.matcher, ["/:path*"]);
  assert.equal(result.adminCookie, "gg_hub_session");
  assert.equal(result.accountCookie, "gg_hub_account_session");
  assert.deepEqual(result.next, ["/admin/users", "/admin/community-network", "/account", "/account/password"]);
  assert.equal(result.responses[0].location, "https://hub.example/admin/community-network");
  assert.equal(result.responses[1].location, "https://hub.example/");
  assert.equal(result.responses[2].next, "1");
  assert.equal(result.responses[3].status, 404);
  assert.equal(result.responses[4].status, 404);
  assert.equal(result.responses[5].next, "1");
  assert.equal(result.responses[6].trustedPath, "/admin/community-network");
  assert.equal(result.responses[7].status, 405);
  assert.equal(result.responses[7].allow, "GET, HEAD, PUT");
});
