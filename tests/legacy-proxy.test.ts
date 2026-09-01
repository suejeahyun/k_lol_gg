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
