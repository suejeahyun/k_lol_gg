import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const registryPath = resolve(projectRoot, "docs", "releases", "registry.json");
const journalPath = resolve(projectRoot, "drizzle", "meta", "_journal.json");

function fail(message) {
  throw new Error(`RELEASE_EVIDENCE_INVALID: ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(...args) {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const registry = readJson(registryPath);
const journal = readJson(journalPath);
if (registry.schemaVersion !== 1 || !Array.isArray(registry.releases)) fail("schemaVersion 또는 releases가 올바르지 않습니다.");

const migrationTags = new Set((journal.entries ?? []).map((entry) => entry.tag));
const releaseKeys = new Set();
const gitTags = new Set();

for (const release of registry.releases) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(release.featureId ?? "")) fail("featureId는 kebab-case여야 합니다.");
  if (!/^\d+\.\d+\.\d+$/u.test(release.version ?? "")) fail(`${release.featureId}: version은 SemVer여야 합니다.`);
  const releaseKey = `${release.featureId}@${release.version}`;
  if (releaseKeys.has(releaseKey)) fail(`${releaseKey}: 중복 릴리스입니다.`);
  releaseKeys.add(releaseKey);

  const expectedTag = `${release.featureId}-v${release.version}`;
  if (release.gitTag !== expectedTag || gitTags.has(release.gitTag)) fail(`${releaseKey}: Git tag 형식 또는 중복을 확인하세요.`);
  gitTags.add(release.gitTag);
  if (!/^[a-f0-9]{40}$/u.test(release.commit ?? "")) fail(`${releaseKey}: commit은 40자리 SHA여야 합니다.`);
  let taggedCommit = "";
  try {
    taggedCommit = git("rev-list", "-n", "1", release.gitTag);
  } catch {
    fail(`${releaseKey}: 로컬에 Git tag ${release.gitTag}가 없습니다.`);
  }
  if (taggedCommit !== release.commit) fail(`${releaseKey}: tag와 commit이 일치하지 않습니다.`);
  if (!migrationTags.has(release.migrationHead)) fail(`${releaseKey}: migrationHead가 journal에 없습니다.`);

  for (const field of ["qaEvidence", "patchNotes"]) {
    const relativePath = release[field];
    if (typeof relativePath !== "string" || relativePath.startsWith("/") || relativePath.includes("..") || !existsSync(resolve(projectRoot, relativePath))) {
      fail(`${releaseKey}: ${field} 파일을 찾을 수 없습니다.`);
    }
  }

  const deployment = release.deployment;
  if (!deployment || !["PRODUCTION", "PREVIEW", "NOT_DEPLOYED"].includes(deployment.status)) fail(`${releaseKey}: 배포 상태가 올바르지 않습니다.`);
  if (deployment.status !== "NOT_DEPLOYED") {
    if (!deployment.deploymentId || !/^https:\/\//u.test(deployment.url ?? "") || !deployment.verifiedAt) fail(`${releaseKey}: 배포 ID, URL 또는 확인 시각이 없습니다.`);
  }
  if (deployment.status === "PRODUCTION" && (deployment.healthStatus !== "ready" || !/^https:\/\//u.test(deployment.alias ?? ""))) {
    fail(`${releaseKey}: 운영 alias와 ready health 근거가 필요합니다.`);
  }

  for (const installation of release.externalInstallations ?? []) {
    if (!installation.name || !installation.version || !["INSTALLED", "PENDING_USER_INSTALL"].includes(installation.status)) {
      fail(`${releaseKey}: 외부 설치 상태가 올바르지 않습니다.`);
    }
  }
}

console.log(`기능 릴리스 ${registry.releases.length}개 · Git tag ${gitTags.size}개 · migration 근거 정상`);
