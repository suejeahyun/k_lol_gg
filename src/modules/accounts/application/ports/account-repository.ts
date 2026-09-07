import type { AuthSessionSeed } from "@/modules/auth/domain/auth-session";

import type {
  AccountMutationCommand,
  AccountMutationOutcome,
  AccountStatusInput,
  AccountSelfDto,
  AdminAccountDto,
  AdminAccountListDto,
  AdminAccountListQuery,
  PasswordChangeInput,
  SignupInput,
  UserLoginInput,
} from "../../domain/account-contracts";

export type UserLoginResult =
  | Readonly<{ type: "authenticated"; session: AuthSessionSeed; account: AccountSelfDto }>
  | Readonly<{ type: "invalid-credentials" }>;

export interface AccountRepository {
  authenticateUser(input: UserLoginInput, now: Date): Promise<UserLoginResult>;
  findSelf(userAccountId: string): Promise<AccountSelfDto | null>;
  listAdmin(
    query: AdminAccountListQuery,
    viewerRole: "ADMIN" | "SUPER_ADMIN",
  ): Promise<AdminAccountListDto>;
  findAdmin(
    userAccountId: string,
    viewerRole: "ADMIN" | "SUPER_ADMIN",
  ): Promise<AdminAccountDto | null>;
  resolveLegacyId(legacyId: number): Promise<string | null>;
  resolvePlayerAccount(playerIdOrLegacyId: string): Promise<string | null>;
  signup(
    input: SignupInput,
    passwordHash: string,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  requestPasswordReset(
    normalizedLoginId: string,
    loginIdHash: Uint8Array,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  changeOwnPassword(
    input: PasswordChangeInput,
    nextPasswordHash: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  changeStatus(
    userAccountId: string,
    nextStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED",
    reason: AccountStatusInput,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  changeRole(
    userAccountId: string,
    nextRole: "USER" | "ADMIN",
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  resetPassword(
    userAccountId: string,
    temporaryPasswordHash: string,
    temporaryPassword: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  resetAdminTotp(
    userAccountId: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  softDelete(
    userAccountId: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
  restore(
    userAccountId: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome>;
}
