const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL_OR_BIDI_PATTERN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export type AdminTargetOptionQuery = Readonly<{
  query: string;
  include: Readonly<{ kind: "player" | "account"; id: string }> | null;
}>;

export function parseAdminTargetOptionQuery(url: string): AdminTargetOptionQuery | null {
  const params = new URL(url).searchParams;
  const allowed = new Set(["q", "include"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) return null;
  if ([...allowed].some((key) => params.getAll(key).length > 1)) return null;
  const query = (params.get("q") ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (query.length < 2 || query.length > 64 || CONTROL_OR_BIDI_PATTERN.test(query)) return null;
  const rawInclude = params.get("include");
  if (!rawInclude) return { query, include: null };
  const match = /^(player|account):([0-9a-f-]+)$/iu.exec(rawInclude);
  if (!match || !UUID_PATTERN.test(match[2] ?? "")) return null;
  return {
    query,
    include: { kind: match[1]!.toLocaleLowerCase("en-US") as "player" | "account", id: match[2]!.toLocaleLowerCase("en-US") },
  };
}
