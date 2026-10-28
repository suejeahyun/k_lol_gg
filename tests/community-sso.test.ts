import assert from "node:assert/strict";
import test from "node:test";
import { communitySsoCallbackMatches, communitySsoSiteAllowsAccount, parseCommunitySsoRequest, ssoOrigin } from "../src/modules/auth/domain/community-sso";
import { communitySsoChallenge, communitySsoClientHash, communitySsoSecretMatches, newCommunitySsoToken, encodeCommunitySsoFlow, decodeCommunitySsoFlow } from "../src/modules/auth/infrastructure/community-sso-crypto";

test("SSO limits unpublished sites to their owner and binds the exact HTTPS callback", () => {
  assert.equal(communitySsoSiteAllowsAccount({ status: "AWAITING_OWNER", ownerUserAccountId: "owner" }, "outsider"), false);
  assert.equal(communitySsoSiteAllowsAccount({ status: "AWAITING_OWNER", ownerUserAccountId: "owner" }, "owner"), true);
  assert.equal(communitySsoSiteAllowsAccount({ status: "ACTIVATING", ownerUserAccountId: "owner" }, "outsider"), false);
  assert.equal(communitySsoSiteAllowsAccount({ status: "ACTIVATING", ownerUserAccountId: "owner" }, "owner"), true);
  for (const status of ["SUBMITTED", "APPROVED", "PROVISIONING", "FAILED", "CANCELLED"]) assert.equal(communitySsoSiteAllowsAccount({ status, ownerUserAccountId: "owner" }, "owner"), false);
  assert.equal(communitySsoCallbackMatches("https://child.example", "https://child.example/api/auth/community-sso/callback"), true);
  for (const callback of ["https://evil.example/api/auth/community-sso/callback", "https://child.example/api/auth/community-sso/callback?next=evil", "https://child.example/other", "http://child.example/api/auth/community-sso/callback"]) assert.equal(communitySsoCallbackMatches("https://child.example", callback), false);
  for (const origin of ["https://hub.example/path", "https://user:secret@hub.example", "http://hub.example", "https://hub.example?x=1"]) assert.throws(() => ssoOrigin(origin));
});

test("SSO requires exact request fields and high entropy tokens", () => {
  const verifier = newCommunitySsoToken(), state = newCommunitySsoToken();
  const request = { siteId: "00000000-0000-4000-8000-000000000001", callbackUrl: "https://child.example/api/auth/community-sso/callback", codeChallenge: communitySsoChallenge(verifier), state, purpose: "ACCOUNT" };
  assert.ok(parseCommunitySsoRequest(request));
  assert.equal(parseCommunitySsoRequest({ ...request, role: "ADMIN" }), null);
  assert.equal(parseCommunitySsoRequest({ ...request, state: "short" }), null);
  assert.equal(communitySsoSecretMatches(verifier, communitySsoClientHash(verifier)), true);
  assert.equal(communitySsoSecretMatches(state, communitySsoClientHash(verifier)), false);
});

test("SSO flow cookie cannot be forged, moved to another site or confused with a session", async () => {
  const previous = process.env.SESSION_SIGNING_KEYS;
  process.env.SESSION_SIGNING_KEYS = JSON.stringify({ current: "synthetic", keys: { synthetic: Buffer.alloc(32, 7).toString("base64url") } });
  try {
    const flow = { siteId: "00000000-0000-4000-8000-000000000001", state: newCommunitySsoToken(), verifier: newCommunitySsoToken(), purpose: "ACCOUNT" as const, nextPath: "/recruits" };
    const token = await encodeCommunitySsoFlow(flow);
    assert.deepEqual(await decodeCommunitySsoFlow(token, flow.siteId), flow);
    assert.equal(await decodeCommunitySsoFlow(token, "different-site"), null);
    assert.equal(await decodeCommunitySsoFlow(`${token.slice(0, -4)}AAAA`, flow.siteId), null);
  } finally { if (previous === undefined) delete process.env.SESSION_SIGNING_KEYS; else process.env.SESSION_SIGNING_KEYS = previous; }
});
