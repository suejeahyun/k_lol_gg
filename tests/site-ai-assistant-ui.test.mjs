import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("feature-gated site assistant is mounted globally and uses protected AI contracts", () => {
  const layout = source("../src/app/layout.tsx");
  const assistant = source("../src/components/site-ai-assistant.tsx");
  assert.match(layout, /<SiteAiAssistant\s*\/>/u);
  for (const contract of [
    'fetch("/api/site-settings"',
    "features?.aiAssistant",
    'fetch("/api/ai/chat"',
    '"Idempotency-Key"',
    '"If-Match"',
    'role="dialog"',
    'aria-live="polite"',
    'aria-hidden="true"',
    'tabIndex={-1}',
    "maxLength={1_800}",
  ]) assert.equal(assistant.includes(contract), true, contract);
  assert.equal(assistant.includes("dangerouslySetInnerHTML"), false);
  assert.equal(assistant.includes("localStorage"), false);
  const styles = source("../src/components/site-ai-assistant.module.css");
  assert.match(styles, /bottom:\s*calc\(6\.25rem \+ env\(safe-area-inset-bottom\)\)/u);
  assert.match(styles, /body:has\(main input:focus/u);
});
