import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyCoinTossDestination,
  buildLegacyRandomTeamDestination,
} from "../src/modules/navigation/application/legacy-team-tool-redirects";

test("랜덤 팀 legacy redirect는 mode와 PWA source allowlist만 보존한다", () => {
  assert.equal(
    buildLegacyRandomTeamDestination({
      mode: "tier",
      source: "pwa",
      token: "drop-me",
      next: "https://evil.example",
      result: "front",
    }),
    "/tools/random-team?mode=tier&source=pwa",
  );
  assert.equal(
    buildLegacyRandomTeamDestination({ mode: ["tier", "random"], source: "web" }),
    "/tools/random-team",
  );
});

test("코인 토스 legacy redirect는 PWA source만 보존한다", () => {
  assert.equal(
    buildLegacyCoinTossDestination({ source: "pwa", seed: "drop-me", outcome: "BACK" }),
    "/tools/coin-toss?source=pwa",
  );
  assert.equal(buildLegacyCoinTossDestination({ source: ["pwa", "web"] }), "/tools/coin-toss");
});
