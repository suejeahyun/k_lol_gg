import type { KakaoSeasonSnapshotParticipant } from "./domain";

export type InhouseCopyRow = Readonly<{
  slotNo: number;
  name: string;
  reserve: boolean;
  pending: boolean;
  mainPosition: KakaoSeasonSnapshotParticipant["mainPosition"];
  subPositions: readonly KakaoSeasonSnapshotParticipant["mainPosition"][];
}>;

function identity(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

/** Merge additions and unchanged pending-row corrections without replacing the latest roster. */
export function planInhouseCopyAdditions(input: Readonly<{
  original: readonly InhouseCopyRow[];
  current: readonly InhouseCopyRow[];
  submitted: readonly KakaoSeasonSnapshotParticipant[];
}>) {
  const submitted = new Map(input.submitted.map((row) => [row.slotNo, row]));
  if (submitted.size !== input.submitted.length) return null;
  const pendingEdits: Array<Readonly<{
    original: InhouseCopyRow;
    current: InhouseCopyRow;
    submitted: KakaoSeasonSnapshotParticipant;
  }>> = [];
  for (const row of input.original) {
    const copy = submitted.get(row.slotNo);
    if (!copy || copy.reserve !== row.reserve ||
        (!copy.nameOnly && (copy.mainPosition !== row.mainPosition ||
          copy.subPositions.join("|") !== row.subPositions.join("|")))) return null;
    if (identity(copy.name) === identity(row.name)) continue;
    const current = input.current.find((candidate) => candidate.slotNo === row.slotNo);
    if (!row.pending || !current?.pending || identity(current.name) !== identity(row.name) ||
        current.reserve !== row.reserve || current.mainPosition !== row.mainPosition ||
        current.subPositions.join("|") !== row.subPositions.join("|") ||
        input.current.some((candidate) => candidate.slotNo !== row.slotNo && identity(candidate.name) === identity(copy.name))) return null;
    pendingEdits.push(Object.freeze({ original: row, current, submitted: Object.freeze({
      ...copy,
      ...(copy.nameOnly ? { mainPosition: current.mainPosition, subPositions: current.subPositions } : {}),
    }) }));
  }
  const originalSlots = new Set(input.original.map((row) => row.slotNo));
  const seen = new Set<string>();
  const additions: KakaoSeasonSnapshotParticipant[] = [];
  for (const row of input.submitted) {
    const key = identity(row.name);
    if (seen.has(key)) return null;
    seen.add(key);
    if (originalSlots.has(row.slotNo)) continue;
    const alreadySaved = input.current.find((current) => identity(current.name) === key);
    if (alreadySaved) {
      if (alreadySaved.reserve !== row.reserve) return null;
      continue;
    }
    additions.push(row);
  }
  return Object.freeze({ additions: Object.freeze(additions), pendingEdits: Object.freeze(pendingEdits) });
}
