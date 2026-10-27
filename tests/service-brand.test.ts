import assert from "node:assert/strict";
import test from "node:test";
import { getServiceBrand, getServiceOrigin } from "../src/lib/service-brand";

test("service selection keeps K-LOL defaults and rejects misspelled service identities", () => {
  assert.equal(getServiceBrand("").name, "K-LOL.GG");
  assert.equal(getServiceBrand("klol").storagePrefix, "klol");
  assert.equal(getServiceBrand("nexus").name, "NEXUS.GG");
  assert.equal(getServiceBrand("nexus").storagePrefix, "nexus");
  assert.throws(() => getServiceBrand("nexsu"), /NEXT_PUBLIC_SERVICE_ID/);
});

test("an unconfigured NEXUS origin cannot produce links to the existing community", () => {
  assert.equal(getServiceOrigin("", getServiceBrand("klol")).origin, "https://k-lol-gg.vercel.app");
  assert.equal(getServiceOrigin("", getServiceBrand("nexus")).origin, "http://localhost:3000");
  assert.equal(getServiceOrigin("https://nexus.example/community?from=setup#top", getServiceBrand("nexus")).href, "https://nexus.example/");
  assert.throws(() => getServiceOrigin("javascript:alert(1)", getServiceBrand("nexus")), /http or https/);
});
