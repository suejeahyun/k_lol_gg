import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Unknown history, manual redeploys and every runtime/config change must build. */
export function shouldSkipDocsOnlyDeployment(environment, git) {
  const previous = environment.VERCEL_GIT_PREVIOUS_SHA;
  const current = environment.VERCEL_GIT_COMMIT_SHA;
  if (!/^[a-f0-9]{40}$/u.test(previous ?? "") || !/^[a-f0-9]{40}$/u.test(current ?? "") || previous === current) return false;
  try {
    if (git(["rev-parse", "HEAD"]).trim() !== current) return false;
    git(["merge-base", "--is-ancestor", previous, current]);
    const files = git(["diff", "--name-only", "--no-renames", "-z", previous, current, "--"]).split("\0").filter(Boolean);
    return files.length > 0 && files.every((file) => file === "README.md" || file.startsWith("docs/"));
  } catch { return false; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const skip = shouldSkipDocsOnlyDeployment(process.env, (args) => execFileSync("git", args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
  }));
  console.log(skip ? "Documentation-only change since last successful deployment; preserving the current runtime." : "Runtime/config change or unknown deployment history; building.");
  process.exitCode = skip ? 0 : 1;
}
