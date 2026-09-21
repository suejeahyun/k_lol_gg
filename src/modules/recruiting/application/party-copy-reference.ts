import { createHash } from "node:crypto";

/** A copy reference is a concurrency token, never an authorization credential. */
export function partyCopyReference(party: Readonly<{ id: string; recruitDate: string; revision: number }>) {
  const identity = createHash("sha256").update(party.id).digest("hex").slice(0, 32);
  return `${party.recruitDate} / P${identity}-R${party.revision}`;
}
