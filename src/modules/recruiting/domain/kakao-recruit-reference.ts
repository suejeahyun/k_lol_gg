const RECRUIT_CODE = /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/u;

/** Public identity, never an authentication or ownership credential. */
export function normalizeRecruitCode(value: string): string | null {
  const code = value.normalize("NFKC").trim().toUpperCase();
  return RECRUIT_CODE.test(code) ? code : null;
}

/** Internal transport for a fixed identity and an immutable copy original. */
export function parseRecruitFormReference(value: string | null | undefined): Readonly<{ code: string; version: number }> | null {
  if (typeof value !== "string") return null;
  const match = /^([2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5})@([1-9][0-9]*)$/u.exec(value);
  if (!match) return null;
  const version = Number(match[2]);
  return Number.isSafeInteger(version) ? { code: match[1], version } : null;
}

export function formatRecruitFormReference(code: string, version: number): string {
  if (!RECRUIT_CODE.test(code) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("INVALID_RECRUIT_FORM_REFERENCE");
  }
  return `${code}@${version}`;
}

export function recruitFormIdentityLines(reference: string): string[] {
  const identity = parseRecruitFormReference(reference);
  return identity
    ? [`모집코드: ${identity.code}`, `명단버전: ${identity.version}`]
    : [`양식코드: ${reference}`];
}
