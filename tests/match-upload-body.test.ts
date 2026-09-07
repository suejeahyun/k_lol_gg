import assert from "node:assert/strict";
import test from "node:test";

import { readExactUploadBody } from "../src/modules/matches/infrastructure/match-upload-body";

test("stalled upload body reaches an idle deadline and cancels its stream", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
    },
    cancel() { cancelled = true; },
  });
  const request = new Request("http://local.test/upload", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const result = await readExactUploadBody(request, 8, {
    totalTimeoutMs: 50,
    idleTimeoutMs: 10,
  });
  assert.deepEqual(result, { ok: false, error: "TIMEOUT" });
  assert.equal(cancelled, true);
});

test("exact upload body still joins chunks under the deadline", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2]));
      controller.enqueue(Uint8Array.from([3, 4]));
      controller.close();
    },
  });
  const request = new Request("http://local.test/upload", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const result = await readExactUploadBody(request, 4, {
    totalTimeoutMs: 50,
    idleTimeoutMs: 20,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual([...result.bytes], [1, 2, 3, 4]);
});
