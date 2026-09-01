import type { AuthAccount } from "../../domain/auth-account";

export interface AuthAccountRepository {
  readonly source: "fixture" | "database";
  findByLoginId(loginId: string): Promise<AuthAccount | null>;
  findById(accountId: string): Promise<AuthAccount | null>;
  consumeTotpStep(accountId: string, step: number): Promise<boolean>;
}
