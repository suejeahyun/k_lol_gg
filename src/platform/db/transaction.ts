import type { V2Database } from "./database";

type TransactionCallback = Parameters<V2Database["transaction"]>[0];

export type V2Transaction = Parameters<TransactionCallback>[0];
export type DatabaseExecutor = V2Database | V2Transaction;

export function withTransaction<T>(
  database: V2Database,
  work: (transaction: V2Transaction) => Promise<T>,
): Promise<T> {
  return database.transaction(work);
}
