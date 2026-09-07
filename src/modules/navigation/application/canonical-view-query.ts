export type CanonicalSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export type CanonicalViewQueryResult<Key extends string> =
  | Readonly<{ ok: true; values: Readonly<Partial<Record<Key, string>>> }>
  | Readonly<{ ok: false }>;

/**
 * Parses small canonical tab/view/mode selectors. Unknown, duplicated, blank,
 * or unreviewed values fail closed instead of silently selecting a different
 * workspace that may expose unrelated records.
 */
export function parseCanonicalViewQuery<Key extends string>(
  searchParams: CanonicalSearchParams,
  schema: Readonly<Record<Key, readonly string[]>>,
): CanonicalViewQueryResult<Key> {
  const values: Partial<Record<Key, string>> = {};
  for (const [rawKey, rawValue] of Object.entries(searchParams)) {
    if (rawValue === undefined) continue;
    if (!Object.hasOwn(schema, rawKey)) return { ok: false };
    const key = rawKey as Key;
    if (Array.isArray(rawValue)) {
      if (rawValue.length !== 1) return { ok: false };
      const value = rawValue[0];
      if (!value || !schema[key].includes(value)) return { ok: false };
      values[key] = value;
      continue;
    }
    if (!schema[key].includes(rawValue as string)) return { ok: false };
    values[key] = rawValue as string;
  }
  return { ok: true, values };
}
