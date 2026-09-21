import type { KakaoSeasonSnapshotParticipant } from "./domain";

export type InhouseCopyRow = Readonly<{
  id?: string;
  kind?: "APPLICATION" | "PENDING";
  protectedReason?: "SITE" | "REVIEWED";
  slotNo: number;
  name: string;
  reserve: boolean;
  pending: boolean;
  mainPosition: KakaoSeasonSnapshotParticipant["mainPosition"];
  subPositions: readonly KakaoSeasonSnapshotParticipant["mainPosition"][];
}>;

/** Merge changed fields against the issued form while requiring explicit empty rows for deletion. */
export function planInhouseCopyEdits(input: Readonly<{
  original: readonly InhouseCopyRow[];
  current: readonly InhouseCopyRow[];
  submitted: readonly KakaoSeasonSnapshotParticipant[];
  observedSlotNos: readonly number[];
  capacity: number;
}>): Readonly<{ rows: readonly InhouseCopyRow[]; error?: never } | { error: string; rows?: never }> {
  const participants: KakaoSeasonSnapshotParticipant[] = [];
  for (const row of input.submitted) {
    if (!row.nameOnly) { participants.push(row); continue; }
    const original = input.original.find((candidate) => candidate.slotNo === row.slotNo &&
      candidate.reserve === row.reserve && identity(candidate.name) === identity(row.name));
    if (!original) return { error: `${row.reserve ? `예비 ${row.slotNo - input.capacity}` : row.slotNo}번은 새로 추가하거나 바꾸는 이름이라 협곡 라인이 필요해요. 이름/top,mid 또는 이름/all로 적어 주세요. 기존 이름은 그대로 두셔도 돼요.` };
    // The old form omitted these fields. Hydrate from the issued snapshot, not
    // today's roster, so the normal merge preserves concurrent edits/removals.
    participants.push({ ...row, nameOnly: undefined, mainPosition: original.mainPosition, subPositions: original.subPositions });
  }
  const submitted = new Map(participants.map((row) => [row.slotNo, row]));
  const observed = new Set(input.observedSlotNos);
  const result = input.current.map((row) => ({ ...row }));
  const handled = new Set<number>();
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  const rowSame = (left: InhouseCopyRow, right: InhouseCopyRow) =>
    identity(left.name) === identity(right.name) && left.reserve === right.reserve &&
    left.mainPosition === right.mainPosition && same(left.subPositions, right.subPositions);
  const conflict = { error: "다른 사람이 같은 항목을 먼저 수정했어요. 최신 양식을 받아 다시 작성해 주세요." } as const;
  if (submitted.size !== input.submitted.length) return conflict;
  if (new Set(input.submitted.map((row) => identity(row.name))).size !== input.submitted.length) {
    return { error: "같은 이름이 두 번 있어요. 동명이인은 이름(구분 닉네임)으로 작성해 주세요." };
  }
  for (const original of input.original) {
    if (!observed.has(original.slotNo)) return { error: "명단의 번호 행이 빠졌어요. 이름을 지울 때도 번호는 남겨 주세요." };
    let next = submitted.get(original.slotNo);
    let destination = original.slotNo;
    // Explicit deletion plus a matching name in another slot is a move of the same entry.
    if (!next) {
      const moved = participants.find((candidate) => !input.original.some((row) => row.slotNo === candidate.slotNo) &&
        identity(candidate.name) === identity(original.name));
      if (moved) { next = moved; destination = moved.slotNo; }
    }
    handled.add(destination);
    const index = result.findIndex((row) => original.id ? row.id === original.id : row.slotNo === original.slotNo);
    const current = result[index];
    if (!current) {
      if (next && (!rowSame(original, { ...next, pending: original.pending }) || destination !== original.slotNo)) return conflict;
      continue;
    }
    const unchanged = next && rowSame(original, { ...next, pending: original.pending }) && destination === original.slotNo;
    if (unchanged) continue;
    if (current.protectedReason) return { error: `${original.reserve ? `예비 ${original.slotNo - input.capacity}` : original.slotNo}번은 ${current.protectedReason === "SITE" ? "사이트 신청자라 본인이 사이트에서" : "운영진이 확정한 항목이라 운영진이"} 수정해 주세요.` };
    if (!next) {
      if (!rowSame(current, original) || current.slotNo !== original.slotNo) return conflict;
      result.splice(index, 1);
      continue;
    }
    const merged = { ...current };
    for (const field of ["name", "mainPosition", "subPositions", "reserve"] as const) {
      const base = original[field];
      const latest = current[field];
      const value = next[field];
      if (same(value, base) || same(value, latest)) continue;
      if (!same(base, latest)) return conflict;
      Object.assign(merged, { [field]: value });
    }
    if (destination !== original.slotNo) {
      if (current.slotNo !== original.slotNo && current.slotNo !== destination) return conflict;
      merged.slotNo = destination;
    }
    result[index] = merged;
  }
  for (const next of participants) {
    if (handled.has(next.slotNo) || input.original.some((row) => row.slotNo === next.slotNo)) continue;
    const saved = result.find((row) => identity(row.name) === identity(next.name));
    if (saved) {
      if (!rowSame(saved, { ...next, pending: saved.pending })) return { error: "같은 이름이 두 번 있어요. 동명이인은 이름(구분 닉네임)으로 작성해 주세요." };
      continue;
    }
    let slotNo = next.slotNo;
    if (result.some((row) => row.slotNo === slotNo)) {
      slotNo = next.reserve ? input.capacity + 1 : 1;
      while (result.some((row) => row.slotNo === slotNo)) slotNo += 1;
    }
    result.push({ ...next, slotNo, pending: true, kind: "PENDING" });
  }
  const seenNames = new Set<string>();
  const seenSlots = new Set<number>();
  for (const row of result) {
    if (seenNames.has(identity(row.name))) return { error: "같은 이름이 두 번 있어요. 동명이인은 이름(구분 닉네임)으로 작성해 주세요." };
    seenNames.add(identity(row.name));
    if (seenSlots.has(row.slotNo)) return conflict;
    seenSlots.add(row.slotNo);
    if ((!row.reserve && row.slotNo > input.capacity) || (row.reserve && row.slotNo <= input.capacity)) return { error: "본 참가가 가득 찼어요. 최신 양식의 예비 칸에 작성해 주세요." };
  }
  if (result.filter((row) => !row.reserve).length > input.capacity) return { error: "본 참가가 가득 찼어요. 최신 양식의 예비 칸에 작성해 주세요." };
  return { rows: result.sort((left, right) => left.slotNo - right.slotNo) };
}

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
