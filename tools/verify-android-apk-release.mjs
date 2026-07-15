import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const metadataPath = join(root, "public", "downloads", "android", "latest.json");

function fail(message) {
  console.error(`APK release check failed: ${message}`);
  process.exit(1);
}

if (!existsSync(metadataPath)) {
  fail("public/downloads/android/latest.json does not exist.");
}

const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

if (metadata.available !== true) {
  fail("latest.json is not marked as available.");
}

if (metadata.channel !== "release") {
  fail(`latest.json channel must be release before production deployment. Current: ${metadata.channel ?? "missing"}`);
}

if (typeof metadata.apkUrl !== "string" || !metadata.apkUrl.startsWith("/downloads/android/")) {
  fail("latest.json apkUrl must point to /downloads/android/*.apk.");
}

if (!metadata.apkUrl.endsWith(".apk")) {
  fail("latest.json apkUrl must end with .apk.");
}

const apkPath = join(root, "public", metadata.apkUrl.replace(/^\//, ""));
if (!existsSync(apkPath)) {
  fail(`APK file does not exist: ${apkPath}`);
}

const apkSize = statSync(apkPath).size;
if (apkSize < 1024 * 1024) {
  fail(`APK file is suspiciously small: ${apkSize} bytes.`);
}

if (!Number.isInteger(metadata.buildNumber) || metadata.buildNumber < 1) {
  fail("latest.json buildNumber must be a positive integer.");
}

console.log("APK release check passed");
console.log(`- channel: ${metadata.channel}`);
console.log(`- version: ${metadata.version}`);
console.log(`- buildNumber: ${metadata.buildNumber}`);
console.log(`- apkUrl: ${metadata.apkUrl}`);
console.log(`- size: ${metadata.apkSize ?? `${(apkSize / 1024 / 1024).toFixed(2)} MB`}`);
