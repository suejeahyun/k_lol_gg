import assert from "node:assert/strict";
import test from "node:test";
import { generateTotpCode, Rfc6238TotpVerifier } from "../src/modules/auth/infrastructure/totp";

function base32Encode(value: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

const RFC_SHA1_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("RFC 6238 SHA-1 vector produces the expected six digit suffix", () => {
  assert.equal(generateTotpCode(RFC_SHA1_SECRET, 1), "287082");
});

test("TOTP verifier accepts only the configured time window", () => {
  const now = 59_000;
  const verifier = new Rfc6238TotpVerifier(() => now, 0);
  assert.deepEqual(verifier.verify(RFC_SHA1_SECRET, "287082"), { ok: true, step: 1 });
  assert.deepEqual(verifier.verify(RFC_SHA1_SECRET, "000000"), { ok: false });
  assert.deepEqual(verifier.verify(RFC_SHA1_SECRET, "abc"), { ok: false });
});
