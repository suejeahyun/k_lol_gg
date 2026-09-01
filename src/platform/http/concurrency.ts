export const MAXIMUM_REVISION = Number.MAX_SAFE_INTEGER;

export type RevisionResult =
  | { ok: true; revision: number }
  | { ok: false; error: "INVALID" | "MISSING" };

const REVISION_PATTERN = /^(?:0|[1-9][0-9]{0,15})$/;

function parseRevisionString(value: string): RevisionResult {
  if (!REVISION_PATTERN.test(value)) return { ok: false, error: "INVALID" };

  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision > MAXIMUM_REVISION) {
    return { ok: false, error: "INVALID" };
  }

  return { ok: true, revision };
}

export function parseRevision(value: unknown): RevisionResult {
  if (value === null || value === undefined || value === "") {
    return { ok: false, error: "MISSING" };
  }
  if (typeof value === "string") return parseRevisionString(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return { ok: true, revision: value };
  }

  return { ok: false, error: "INVALID" };
}

export function readIfMatchRevision(headers: Headers): RevisionResult {
  const rawValue = headers.get("if-match");
  if (rawValue === null) return { ok: false, error: "MISSING" };

  const match = /^"(0|[1-9][0-9]{0,15})"$/.exec(rawValue);
  if (!match) return { ok: false, error: "INVALID" };

  return parseRevisionString(match[1]);
}

export function formatRevisionEtag(revision: number) {
  const parsed = parseRevision(revision);
  if (!parsed.ok) throw new RangeError("revision must be a non-negative safe integer");
  return `"${parsed.revision}"`;
}
