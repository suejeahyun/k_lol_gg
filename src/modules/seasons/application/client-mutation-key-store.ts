import { canonicalJson } from "../domain/season";

export type MutationKeyTicket = Readonly<{ fingerprint: string; key: string }>;

export class ClientMutationKeyStore {
  private readonly keys = new Map<string, string>();

  constructor(
    private readonly prefix: string,
    private readonly generate: () => string = () => crypto.randomUUID(),
  ) {}

  issue(action: string, revision: number, payload: unknown): MutationKeyTicket {
    const fingerprint = canonicalJson({ action, revision, payload });
    let key = this.keys.get(fingerprint);
    if (!key) {
      key = `${this.prefix}-${this.generate()}`;
      this.keys.set(fingerprint, key);
    }
    return { fingerprint, key };
  }

  complete(ticket: MutationKeyTicket) {
    if (this.keys.get(ticket.fingerprint) === ticket.key) this.keys.delete(ticket.fingerprint);
  }
}
