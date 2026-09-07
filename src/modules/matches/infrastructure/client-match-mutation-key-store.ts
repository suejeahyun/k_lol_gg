function canonicalClientJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalClientJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalClientJson(record[key])}`)
    .join(",")}}`;
}

export type MatchMutationKeyTicket = Readonly<{ fingerprint: string; key: string }>;

/** Keeps one browser command key for an exact action/revision/body until success is observed. */
export class ClientMatchMutationKeyStore {
  private readonly keys = new Map<string, string>();

  constructor(
    private readonly prefix: string,
    private readonly generate: () => string = () => crypto.randomUUID(),
  ) {}

  issue(action: string, revision: number, payload: unknown): MatchMutationKeyTicket {
    const fingerprint = canonicalClientJson({ action, revision, payload });
    let key = this.keys.get(fingerprint);
    if (!key) {
      key = `${this.prefix}-${this.generate()}`;
      this.keys.set(fingerprint, key);
    }
    return { fingerprint, key };
  }

  complete(ticket: MatchMutationKeyTicket) {
    if (this.keys.get(ticket.fingerprint) === ticket.key) this.keys.delete(ticket.fingerprint);
  }
}
