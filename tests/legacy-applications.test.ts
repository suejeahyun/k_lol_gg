import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyApplicationsDestination,
  buildLegacySeasonApplicationDestination,
} from "../src/modules/navigation/application/legacy-application-redirects";

test("legacy participation redirects preserve only reviewed query values", () => {
  assert.equal(
    buildLegacyApplicationsDestination({ type: ["season"], source: ["pwa"] }),
    "/applications?type=season&source=pwa",
  );
  assert.equal(
    buildLegacyApplicationsDestination({ type: ["season", "event"], source: ["https://evil.example"] }),
    "/applications",
  );
  assert.equal(
    buildLegacySeasonApplicationDestination({ source: ["kakao"] }),
    "/applications?type=season&source=kakao",
  );
  assert.equal(
    buildLegacySeasonApplicationDestination({ source: ["kakao", "pwa"] }),
    "/applications?type=season",
  );
});
