import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type * as BalanceModule from "../../src/modules/team-tools/domain/team-balance";

/**
 * Independent full-search oracle: changes the ordering in the frozen production
 * source and uses its original per-split shortlist and final selector, rather
 * than the shared multi-selector experiment loop or the candidate helper.
 */
export async function loadSeverityCandidateOracle(sourceDirectory: string, scratchDirectory: string): Promise<typeof BalanceModule> {
  const source = path.resolve(sourceDirectory);
  const scratch = path.resolve(scratchDirectory);
  if (source === scratch || source.startsWith(`${scratch}${path.sep}`) || scratch.startsWith(`${source}${path.sep}`)) {
    throw new Error("Oracle source and scratch directories must be separate.");
  }
  await mkdir(scratch, { recursive: true });
  for (const file of ["team-balance.ts", "inhouse-fairness.ts"]) await copyFile(path.join(source, file), path.join(scratch, file));
  const comparator = (await readFile(path.join(source, "inhouse-joint-search.ts"), "utf8")).replaceAll("\r\n", "\n");
  const oldOrder = "const safety = a.qualityViolationCount - b.qualityViolationCount\n    || excessRisk(a) - excessRisk(b)";
  if (comparator.split(oldOrder).length !== 2) throw new Error("Frozen baseline comparator does not match the preregistered oracle source.");
  await writeFile(path.join(scratch, "inhouse-joint-search.ts"), comparator.replace(oldOrder,
    "const safety = excessRisk(a) - excessRisk(b)\n    || a.qualityViolationCount - b.qualityViolationCount"), "utf8");
  return await import(pathToFileURL(path.join(scratch, "team-balance.ts")).href) as typeof BalanceModule;
}
