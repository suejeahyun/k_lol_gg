import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

test("legacy proxy는 GET/HEAD만 308로 이동하고 query allowlist를 적용한다", () => {
  const home = proxy(new NextRequest("https://v2.example/app?source=pwa&token=drop"));
  assert.equal(home.status, 308);
  assert.equal(home.headers.get("location"), "https://v2.example/?source=pwa");

  const players = proxy(
    new NextRequest(
      "https://v2.example/app/players?q=Sky%20Fox%23V2&page=2&token=drop&next=https://evil.example",
    ),
  );
  assert.equal(players.status, 308);
  assert.equal(players.headers.get("location"), "https://v2.example/players?q=Sky+Fox%23V2&page=2");

  const mutation = proxy(new NextRequest("https://v2.example/app/players", { method: "POST" }));
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get("allow"), "GET, HEAD");
  assert.equal(mutation.headers.has("location"), false);
});

test("UUID mapping이 없는 legacy player detail은 영구 redirect하지 않는다", () => {
  const legacyDetail = proxy(new NextRequest("https://v2.example/app/players/42"));
  assert.equal(legacyDetail.headers.get("x-middleware-next"), "1");
  assert.equal(legacyDetail.headers.has("location"), false);
});

test("legacy account adapters preserve only reviewed canonical intent", () => {
  const login = proxy(new NextRequest("https://v2.example/app/login?next=%2Fplayers%3Fmine%3D1"));
  assert.equal(login.status, 308);
  assert.equal(
    login.headers.get("location"),
    "https://v2.example/login?next=%2Fplayers%3Fmine%3D1",
  );

  const adminEscape = proxy(new NextRequest("https://v2.example/app/login?next=%2Fadmin%2Fusers"));
  assert.equal(adminEscape.headers.get("location"), "https://v2.example/login?next=%2Faccount");

  const duplicateNext = proxy(new NextRequest("https://v2.example/app/login?next=%2Fplayers&next=%2Faccount"));
  assert.equal(duplicateNext.status, 400);
  const unknown = proxy(new NextRequest("https://v2.example/app/account?token=drop"));
  assert.equal(unknown.status, 400);

  const tier = proxy(new NextRequest("https://v2.example/account/tier"));
  assert.equal(tier.headers.get("location"), "https://v2.example/account?tab=player");
  const mePlayer = proxy(new NextRequest("https://v2.example/me/player"));
  assert.equal(mePlayer.headers.get("location"), "https://v2.example/account?tab=player");
  const mutation = proxy(new NextRequest("https://v2.example/me/player", { method: "POST" }));
  assert.equal(mutation.status, 405);
});

test("legacy statistics routes use one allowlisted canonical ranking destination", () => {
  const seasonId = "10000000-0000-4000-8000-000000000000";
  for (const source of [
    `/statistics?seasonId=${seasonId}&minParticipation=5&token=drop`,
    `/app/rankings?seasonId=${seasonId}&minParticipation=5&next=https://evil.example`,
    `/app/matches?tab=rankings&seasonId=${seasonId}&minParticipation=5&token=drop`,
  ]) {
    const response = proxy(new NextRequest(`https://v2.example${source}`));
    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get("location"),
      `https://v2.example/rankings?seasonId=${seasonId}&minParticipation=5`,
    );
  }
  const mutation = proxy(new NextRequest("https://v2.example/statistics", { method: "POST" }));
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get("allow"), "GET, HEAD");
});
