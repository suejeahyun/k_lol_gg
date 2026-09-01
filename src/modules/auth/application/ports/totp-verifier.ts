export interface TotpVerifier {
  verify(secret: string, code: string): { ok: true; step: number } | { ok: false };
}
