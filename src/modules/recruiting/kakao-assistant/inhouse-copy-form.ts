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

/** Only the additions to the copied original are applied to the latest DB roster. */
export function planInhouseCopyAdditions(input: Readonly<{
  original: readonly InhouseCopyRow[];
  current: readonly InhouseCopyRow[];
  submitted: readonly KakaoSeasonSnapshotParticipant[];
}>) {
  const submitted = new Map(input.submitted.map((row) => [row.slotNo, row]));
  if (submitted.size !== input.submitted.length) return null;
  for (const row of input.original) {
    const copy = submitted.get(row.slotNo);
    if (!copy || identity(copy.name) !== identity(row.name) || copy.reserve !== row.reserve ||
        (!copy.nameOnly && (copy.mainPosition !== row.mainPosition ||
          copy.subPositions.join("|") !== row.subPositions.join("|")))) return null;
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
  return Object.freeze(additions);
}
