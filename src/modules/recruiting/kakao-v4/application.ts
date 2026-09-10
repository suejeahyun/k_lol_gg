import { createHash } from "node:crypto";

import type { KakaoProfileAuthorization } from "../kakao-access/postgres-kakao-room-registry";
import {
  KAKAO_V4_COMMAND_CONTRACT,
  KAKAO_V4_V1_CONTRACT,
  type KakaoV4CommandEnvelope,
  type KakaoV4ProfileId,
} from "./domain";
import { canonicalizeKakaoV4Command, type CanonicalKakaoV4Command } from "./canonical-command";
import { classifyKakaoV4Command, type KakaoV4CommandClassification } from "./classifier";
import {
  KakaoV4CommandDispatcher,
  type KakaoV4DispatcherResult,
} from "./dispatcher";

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
  constructor(readonly code: "IDEMPOTENCY_MISMATCH" | "DISPATCHER_UNAVAILABLE" | "WRONG_PROFILE" | "INVALID_FORM") {
    super(code);
  }
}

function envelopeDigest(envelope: KakaoV4CommandEnvelope) {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

function localReply(envelope: KakaoV4CommandEnvelope, classification: KakaoV4CommandClassification): DispatchResult | null {
  if (classification.kind === "UNKNOWN" || classification.kind === "WRONG_PROFILE") return null;
  if (classification.command === "LOCAL_V4_STATUS") {
    return Object.freeze({
      kind: "REPLY" as const,
      reply: `[K-LOL.GG V4 상태]\ncommand gateway: 정상\n프로필: ${envelope.profileId}\n계약: ${KAKAO_V4_COMMAND_CONTRACT}`,
    });
  }
  if (classification.command === "LOCAL_V4_CONTRACT") {
    return Object.freeze({
      kind: "REPLY" as const,
      reply: `[K-LOL.GG V4 계약 확인]\n${KAKAO_V4_V1_CONTRACT}\n프로필: ${envelope.profileId}`,
    });
  }
  if (classification.command === "LOCAL_USER_HELP") return Object.freeze({ kind: "REPLY" as const, reply: "[K-LOL.GG 도움말]\nV1 호환 명령을 사용할 수 있습니다." });
  if (classification.command === "LOCAL_RECRUIT_HELP") return Object.freeze({ kind: "REPLY" as const, reply: "[K-LOL.GG 구인 도움말]\n파티·스크림 모집 명령을 사용할 수 있습니다." });
  if (classification.command === "SCRIM_CREATE") return Object.freeze({
    kind: "REPLY" as const,
    reply: "[K-LOL.GG 스크림 구인 양식]\n\n운영일: 작성일\n번호: #자동배정\n\n일시: \n방식: 3판2선\n\n우리팀: \nTOP: \nJUG: \nMID: \nADC: \nSUP: \n\n상대팀: \nTOP: \nJUG: \nMID: \nADC: \nSUP: ",
  });
  return null;
}

function deterministicFallback(classification: KakaoV4CommandClassification): DispatchResult {
  if (classification.kind === "UNKNOWN") return Object.freeze({ kind: "NOT_IMPLEMENTED" as const });
  if (classification.kind === "WRONG_PROFILE") throw new KakaoV4CommandError("WRONG_PROFILE");
  return Object.freeze({ kind: "REPLY" as const, reply: `[K-LOL.GG V4]\n${classification.command} 요청을 접수했습니다.` });
}

export class KakaoV4CommandService {
  private readonly receipts = new Map<string, Readonly<{ digest: string; result: DispatchResult }>>();

  constructor(
    private readonly authorizer: KakaoV4ProfileAuthorizer,
    private readonly dispatcher?: KakaoV4CommandDispatcher,
  ) {}

  async execute(envelope: KakaoV4CommandEnvelope, keyId: string, metadata?: Readonly<{ requestDigestHex: string; requestId: string }>): Promise<KakaoV4CommandResult> {
    const authorization = await this.authorizer.authorizeProfile({
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
    const classification = classifyKakaoV4Command({ profileId: envelope.profileId, text: envelope.text });
    if (classification.kind === "WRONG_PROFILE") throw new KakaoV4CommandError("WRONG_PROFILE");
    let result = localReply(envelope, classification);
    if (!result && this.dispatcher) {
      const canonical = canonicalizeKakaoV4Command(classification, envelope);
      if (canonical) {
        const dispatched = await this.dispatcher.dispatch({ envelope, keyId, requestDigestHex: metadata?.requestDigestHex ?? digest, requestId: metadata?.requestId ?? envelope.eventId, authorization }, canonical);
        result = Object.freeze({ kind: "REPLY" as const, reply: dispatched.legacyReply });
      }
    }
    result ??= this.dispatcher ? Object.freeze({ kind: "NOT_IMPLEMENTED" as const }) : deterministicFallback(classification);
    if (this.receipts.size >= 1_024) this.receipts.delete(this.receipts.keys().next().value as string);
    this.receipts.set(receiptKey, Object.freeze({ digest, result }));
    return Object.freeze({ ...result, replayed: false });
  }

  async executeCanonical(input: Readonly<{
    envelope: KakaoV4CommandEnvelope;
    keyId: string;
    requestDigestHex: string;
    requestId: string;
    command: CanonicalKakaoV4Command;
  }>): Promise<KakaoV4DispatcherResult> {
    if (!this.dispatcher) throw new KakaoV4CommandError("DISPATCHER_UNAVAILABLE");
    const authorization = await this.authorizer.authorizeProfile({
      installationPublicId: input.envelope.installationId,
      requiredCapabilityProfile: input.envelope.profileId,
      keyId: input.keyId,
    });
    return this.dispatcher.dispatch({
      envelope: input.envelope,
      keyId: input.keyId,
      requestDigestHex: input.requestDigestHex,
      requestId: input.requestId,
      authorization,
    }, input.command);
  }
}
