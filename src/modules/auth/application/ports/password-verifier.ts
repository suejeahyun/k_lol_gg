export interface PasswordVerifier {
  verify(password: string, passwordHash: string | null): Promise<boolean>;
}
