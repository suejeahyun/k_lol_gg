import assert from "node:assert/strict";
import test from "node:test";
import { shouldSkipDocsOnlyDeployment } from "../scripts/releases/ignore-docs-only-deployment.mjs";
const previous = "a".repeat(40); const current = "b".repeat(40);
const environment = { VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: current };
function gitFor(files) {
  return (args) => {
    if (args[0] === "rev-parse") return current;
    if (args[0] === "merge-base") { assert.deepEqual(args.slice(2), [previous, current]); return ""; }
    assert.deepEqual(args, ["diff", "--name-only", "--no-renames", "-z", previous, current, "--"]);
    return files.join("\0") + "\0";
  };
}
test("only documentation changed since the actual successful deployment can skip", () => {
  assert.equal(shouldSkipDocsOnlyDeployment(environment, gitFor(["README.md", "docs/releases/registry.json"])), true);
  for (const file of ["src/app/page.tsx", "vercel.json", "package-lock.json", "drizzle/0044_vengeful_trauma.sql", ".env.example", "public/icon.png", "docs-runtime.js"]) {
    assert.equal(shouldSkipDocsOnlyDeployment(environment, gitFor(["docs/STATUS.md", file])), false);
  }
});
test("first deployments, manual redeploys, missing history and mismatched checkout build", () => {
  const unavailable = () => { throw new Error("history unavailable"); };
  assert.equal(shouldSkipDocsOnlyDeployment({}, unavailable), false);
  assert.equal(shouldSkipDocsOnlyDeployment({ ...environment, VERCEL_GIT_PREVIOUS_SHA: current }, unavailable), false);
  assert.equal(shouldSkipDocsOnlyDeployment(environment, unavailable), false);
  assert.equal(shouldSkipDocsOnlyDeployment(environment, () => previous), false);
  assert.equal(shouldSkipDocsOnlyDeployment(environment, gitFor([])), false);
});
