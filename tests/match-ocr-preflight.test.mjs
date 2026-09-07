import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../src/app/api/admin/matches/submissions/[submissionId]/images/[imageId]/ocr/route.ts", import.meta.url);
const repositoryPath = new URL("../src/modules/matches/infrastructure/postgres-match-repository.ts", import.meta.url);
const schemaPath = new URL("../src/platform/db/schema/matches.ts", import.meta.url);

test("OCR route reserves before the process gate and all external work", async () => {
  const source = await readFile(routePath, "utf8");
  const reserve = source.indexOf("prepareSubmissionImageOcr");
  const gate = source.indexOf("getMatchImageWorkGate().acquire");
  const finalize = source.indexOf("finalizeSubmissionImageOcr");
  assert.ok(reserve >= 0 && gate > reserve && finalize > gate);
  assert.match(source, /reservation\.kind === "REPLAY"/);
  assert.match(source, /failSubmissionImageOcrReservation/);
  assert.match(source, /OCR_WORK_GATE_UNAVAILABLE/);
  assert.match(source, /OCR_FINALIZE_FAILED/);
});

test("OCR reservation is durable, single-image and replay-first", async () => {
  const [repository, schema] = await Promise.all([
    readFile(repositoryPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const reserveStart = repository.indexOf("async reservePrivateImageOcr");
  const reserveEnd = repository.indexOf("async finalizePrivateImageOcr", reserveStart);
  const reserve = repository.slice(reserveStart, reserveEnd);
  assert.ok(reserveStart >= 0 && reserveEnd > reserveStart);
  assert.ok(reserve.indexOf("const replay = await receipt") < reserve.indexOf("consumeOcrRateLimit"));
  assert.ok(reserve.indexOf("const existing =") < reserve.indexOf("consumeOcrRateLimit"));
  assert.match(reserve, /OCR_RESERVATION_EXPIRED/);
  assert.match(reserve, /clock_timestamp\(\)/);
  assert.match(schema, /match_ocr_reservations_active_image_uidx/);
  assert.match(schema, /where\(sql`\$\{table\.status\} = 'RESERVED'`\)/);
  assert.match(schema, /match_ocr_reservations_lifecycle_consistency/);
});
