type IdentityRow = Readonly<{ id: string; legacy_id: number | string | null; status: string }>;

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

function legacyNumber(value: IdentityRow["legacy_id"]) {
  if (value === null) return null;
  const number = typeof value === "number" ? value : /^\d+$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("INVALID_RESEARCH_LEGACY_ORDER");
  return number;
}

/**
 * Keep both production ordering rules while source identities remain only in
 * memory: UUID order breaks final signature ties; legacy order selects the RED
 * anchor and orders equal-strength players. Never serialize these maps.
 */
export function createResearchPlayerIdentity(rows: readonly IdentityRow[]) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("DUPLICATE_RESEARCH_PLAYER_ID");
  const canonical = [...rows].sort((left, right) => compareText(left.id, right.id));
  const aliasWidth = Math.max(4, String(rows.length).length);
  const anonymous = new Map(canonical.map((row, index) => [row.id, `P${String(index + 1).padStart(aliasWidth, "0")}`]));
  const legacy = new Map(rows.map(row => [row.id, legacyNumber(row.legacy_id)]));
  const active = rows.filter(row => row.status === "ACTIVE").sort((left, right) => {
    const a = legacy.get(left.id)!; const b = legacy.get(right.id)!;
    if (a !== null && b !== null) return a - b || compareText(left.id, right.id);
    if (a !== null) return -1;
    if (b !== null) return 1;
    return compareText(left.id, right.id);
  });
  const activeLegacyOrdinal = new Map(active.map((row, index) => [row.id, index + 1]));
  for (let index = 1; index < canonical.length; index += 1) {
    if (compareText(anonymous.get(canonical[index - 1].id)!, anonymous.get(canonical[index].id)!) >= 0) {
      throw new Error("RESEARCH_CANONICAL_ORDER_CHANGED");
    }
  }
  for (let index = 1; index < active.length; index += 1) {
    if (activeLegacyOrdinal.get(active[index - 1].id)! >= activeLegacyOrdinal.get(active[index].id)!) {
      throw new Error("RESEARCH_LEGACY_ORDER_CHANGED");
    }
  }
  return { anonymous, activeLegacyOrdinal,
    invariant: { uuidCanonicalOrderPreserved: true as const, legacyOrderPreserved: true as const, aliasWidth } };
}
