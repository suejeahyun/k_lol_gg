import { createHash } from "node:crypto";

import type { KakaoProfileAuthorization } from "../kakao-access/postgres-kakao-room-registry";
import {
  KAKAO_V4_COMMAND_CONTRACT,
  KAKAO_V4_V1_CONTRACT,
  canonicalKakaoV4CommandText,
  type KakaoV4CommandEnvelope,
  type KakaoV4ProfileId,
} from "./domain";

export type KakaoV4ProfileAuthorizer = Readonly<{
  authorizeProfile(input: Readonly<{
    installationPublicId: string;
    requiredCapabilityProfile: KakaoV4ProfileId;
    keyId: string;
  }>): Promise<KakaoProfileAuthorization>;
}>;

type DispatchResult =
  | Readonly<{ kind: "REPLY"; reply: string }>
  | Readonly<{ kind: "NOT_IMPLEMENTED" }>;

export type KakaoV4CommandResult = DispatchResult & Readonly<{ replayed: boolean }>;

export class KakaoV4CommandError extends Error {
  constructor(readonly code: "IDEMPOTENCY_MISMATCH") {
    super(code);
  }
}

function envelopeDigest(envelope: KakaoV4CommandEnvelope) {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

function dispatchProbe(envelope: KakaoV4CommandEnvelope): DispatchResult {
  const command = canonicalKakaoV4CommandText(envelope.text);
  if (command === "V4상태") {
    return Object.freeze({
      kind: "REPLY" as const,
      reply: `[K-LOL.GG V4 상태]\ncommand gateway: 정상\n프로필: ${envelope.profileId}\n계약: ${KAKAO_V4_COMMAND_CONTRACT}`,
    });
  }
  if (command === "V4계약확인") {
    return Object.freeze({
      kind: "REPLY" as const,
      reply: `[K-LOL.GG V4 계약 확인]\n${KAKAO_V4_V1_CONTRACT}\n프로필: ${envelope.profileId}`,
    });
  }
  return Object.freeze({ kind: "NOT_IMPLEMENTED" as const });
}

export class KakaoV4CommandService {
  private readonly receipts = new Map<string, Readonly<{ digest: string; result: DispatchResult }>>();

  constructor(private readonly authorizer: KakaoV4ProfileAuthorizer) {}

  async execute(envelope: KakaoV4CommandEnvelope, keyId: string): Promise<KakaoV4CommandResult> {
    await this.authorizer.authorizeProfile({
      installationPublicId: envelope.installationId,
      requiredCapabilityProfile: envelope.profileId,
      keyId,
    });
    const receiptKey = `${envelope.installationId}:${envelope.eventId}`;
    const digest = envelopeDigest(envelope);
    const current = this.receipts.get(receiptKey);
    if (current) {
      if (current.digest !== digest) throw new KakaoV4CommandError("IDEMPOTENCY_MISMATCH");
      return Object.freeze({ ...current.result, replayed: true });
    }
    const result = dispatchProbe(envelope);
    if (this.receipts.size >= 1_024) this.receipts.delete(this.receipts.keys().next().value as string);
    this.receipts.set(receiptKey, Object.freeze({ digest, result }));
    return Object.freeze({ ...result, replayed: false });
  }
}
