import type { AuthAccountRepository } from "../application/ports/auth-account-repository";
import type { AuthAccount } from "../domain/auth-account";
import type { AuthAccountRecord } from "../domain/auth-records";
import type { AuthRepository } from "../application/ports/auth-repository";

export class DatabaseAuthAccountRepository implements AuthAccountRepository {
  readonly source = "database" as const;

  constructor(
    private readonly repository: AuthRepository,
  ) {}

  async findByLoginId(loginId: string): Promise<AuthAccount | null> {
    return this.hydrate(await this.repository.findAccountByLoginId(loginId));
  }

  async findById(accountId: string): Promise<AuthAccount | null> {
    return this.hydrate(await this.repository.findAccountById(accountId));
  }

  async consumeTotpStep(accountId: string, step: number): Promise<boolean> {
    return this.repository.consumeTotpStep(accountId, step, new Date());
  }

  private async hydrate(account: AuthAccountRecord | null): Promise<AuthAccount | null> {
    if (!account || account.deletedAt) return null;

    return {
      id: account.id,
      loginId: account.loginId,
      passwordHash: account.passwordHash,
      role: account.role,
      status: account.status,
      authVersion: account.authVersion,
      revision: account.revision,
      mustChangePassword: account.mustChangePassword,
      passwordChangedAt: account.passwordChangedAt,
      statusChangedAt: account.statusChangedAt,
      statusReasonPublic: account.statusReasonPublic,
      adminTotpEnabled: false,
      adminTotpSecret: null,
    };
  }
}
