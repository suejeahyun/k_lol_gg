export function resolveSelectableIndex(
  selectableIndices: readonly number[],
  activeIndex: number,
) {
  return selectableIndices.includes(activeIndex)
    ? activeIndex
    : selectableIndices[0] ?? -1;
}

export function moveSelectableIndex(
  selectableIndices: readonly number[],
  activeIndex: number,
  direction: -1 | 1,
) {
  if (selectableIndices.length === 0) return -1;
  const resolved = resolveSelectableIndex(selectableIndices, activeIndex);
  const current = selectableIndices.indexOf(resolved);
  const next = Math.max(0, Math.min(selectableIndices.length - 1, current + direction));
  return selectableIndices[next] ?? selectableIndices[0] ?? -1;
}
