import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { KakaoV4ProfileId } from "./domain";

export type KakaoV4InstallationAuthorization = Readonly<{
  roomId: string;
  roomStatus: "ACTIVE";
  capabilityProfile: KakaoV4ProfileId;
  installationId: string;
}>;

export type KakaoV4ProfileAuthorizer = Readonly<{
  authorizeProfile(input: Readonly<{
    installationPublicId: string;
    requiredCapabilityProfile: KakaoV4ProfileId;
  }>): Promise<KakaoV4InstallationAuthorization>;
}>;

export class KakaoV4InstallationScopeError extends Error {
  constructor(readonly code: "INSTALLATION_INVALID") {
    super(code);
    this.name = "KakaoV4InstallationScopeError";
  }
}

export function kakaoV4InstallationId(profileId: KakaoV4ProfileId, identitySecret: Uint8Array) {
  return `install-${createHmac("sha256", identitySecret)
    .update(`installation-id\nKLOL_V4\n${profileId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

export function kakaoV4InstallationScopeId(installationId: string) {
  return `room-${createHash("sha256")
    .update(`klol-v2:kakao-installation-room-scope:v1\0${installationId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

export class KakaoV4InstallationScopeAuthorizer implements KakaoV4ProfileAuthorizer {
  constructor(private readonly identitySecret: Uint8Array) {
    if (identitySecret.byteLength < 32 || identitySecret.byteLength > 1_024) {
      throw new Error("KAKAO_V4_IDENTITY_SECRET_INVALID");
    }
  }

  async authorizeProfile(input: Readonly<{
    installationPublicId: string;
    requiredCapabilityProfile: KakaoV4ProfileId;
  }>): Promise<KakaoV4InstallationAuthorization> {
    const expected = kakaoV4InstallationId(input.requiredCapabilityProfile, this.identitySecret);
    const actualBytes = Buffer.from(input.installationPublicId, "utf8");
    const expectedBytes = Buffer.from(expected, "utf8");
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
      throw new KakaoV4InstallationScopeError("INSTALLATION_INVALID");
    }
    return Object.freeze({
      roomId: kakaoV4InstallationScopeId(expected),
      roomStatus: "ACTIVE" as const,
      capabilityProfile: input.requiredCapabilityProfile,
      installationId: expected,
    });
  }
}

export function getRuntimeKakaoV4ProfileAuthorizer(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): KakaoV4ProfileAuthorizer | null {
  const value = environment.KLOL_V2_KAKAO_IDENTITY_SECRET;
  if (!value) return null;
  const secret = new TextEncoder().encode(value);
  if (secret.byteLength < 32 || secret.byteLength > 1_024) return null;
  return new KakaoV4InstallationScopeAuthorizer(secret);
}
