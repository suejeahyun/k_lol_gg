import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(pathname) {
  return readFile(new URL(pathname, projectRoot), "utf8");
}

test("PWA manifest and layout publish the expected install contract", async () => {
  const [manifest, layout, registration] = await Promise.all([
    readProjectFile("src/app/manifest.ts"),
    readProjectFile("src/app/layout.tsx"),
    readProjectFile("src/components/pwa-registration.tsx"),
  ]);

  assert.match(manifest, /start_url:\s*"\/start\?source=pwa"/);
  assert.match(manifest, /purpose:\s*"maskable"/);
  assert.equal((manifest.match(/src:\s*"\/icons\//g) ?? []).length, 6);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /<PwaRegistration\s*\/?>/);
  assert.match(registration, /window\.isSecureContext/);
  assert.match(registration, /register\("\/sw\.js"/);
});

test("service worker caches static public assets only", async () => {
  const worker = await readProjectFile("public/sw.js");

  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/images\/champions\/"\)/);
  assert.doesNotMatch(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(worker, /url\.pathname\.startsWith\("\/admin\/"\)/);
  assert.doesNotMatch(worker, /request\.mode\s*===\s*"navigate"/);
});

test("install icons exist and are not empty", async () => {
  for (const pathname of [
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/icon-maskable-512.png",
  ]) {
    const info = await stat(new URL(pathname, projectRoot));
    assert.ok(info.isFile());
    assert.ok(info.size > 1_000);
  }
});
