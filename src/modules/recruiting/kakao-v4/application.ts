import { createHash } from "node:crypto";

import {
  KAKAO_V4_COMMAND_CONTRACT,
  KAKAO_V4_V1_CONTRACT,
  type KakaoV4CommandEnvelope,
} from "./domain";
import type { KakaoV4ProfileAuthorizer } from "./installation-scope";
import { canonicalizeKakaoV4Command, type CanonicalKakaoV4Command } from "./canonical-command";
import { classifyKakaoV4Command, type KakaoV4CommandClassification } from "./classifier";
import {
  KakaoV4CommandDispatcher,
  type KakaoV4DispatcherResult,
} from "./dispatcher";

type DispatchResult = Readonly<{ kind: "REPLY"; reply: string }>;

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
  if (classification.command === "LOCAL_BOT_VERSION") {
    return Object.freeze({ kind: "REPLY" as const, reply: `[K-LOL.GG V4 봇]\n프로필: ${envelope.profileId}\n설치본: ${envelope.installationId}` });
  }
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
  if (classification.command === "LOCAL_USER_HELP") return Object.freeze({
    kind: "REPLY" as const,
    reply: "[K-LOL.GG 일반 도움말]\n\nLOL-K 기능\n- 내전현황 : 현재 시즌내전 신청 현황\n- 내전참가 / 참가신청 : 참가 방법 안내\n- 전적 닉네임#태그 : 플레이어 전적 조회\n- 최근 닉네임#태그 : 최근 경기 조회\n- 랭킹 : 랭킹 조회\n\n운영 기능\n- /등록 : 초보자용 등록 센터\n- /내전등록 : 사이트에서 내전 결과·사진 한 번에 등록\n- /경고등록 : 관리자 경고 등록 화면 열기\n- /인증 : 로그인 후 내 경고 사진을 사이트에서 제출\n- /경고현황 : 내정보의 경고 진행 상황 열기\n- /결과현황 : 사이트의 내 미완료 결과 접수 열기\n\n구인구직 명령어는 구인도움말을 입력해주세요.\n스크림구인은 /스크림구인, /스크림현황을 사용해주세요.\n\n참고\n- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.\n- 예) /내전현황, /전적 닉네임#태그, /구인도움말",
  });
  if (classification.command === "LOCAL_RECRUIT_HELP") return Object.freeze({
    kind: "REPLY" as const,
    reply: "[K-LOL.GG 구인 도움말]\n\n1. 파티\n생성: 5인파티\n현황: 구인현황\n종료: 번호ㅉ\n\n2. 내전\n생성: 내전구인\n현황: 내전현황\n매일 오전 6시 자동 종료\n\n3. 스크림\n생성: 스크림구인\n현황: 스크림현황\n매일 오전 6시 자동 종료\n\n공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송",
  });
  if (classification.command === "LOCAL_RECRUIT_WEB_HELP") return Object.freeze({
    kind: "REPLY" as const,
    reply: "[K-LOL.GG 구인도우미]\n\n현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.\n\nhttps://k-lol-gg.vercel.app/recruit-helper\n\n구인현황 바로가기:\nhttps://k-lol-gg.vercel.app/recruit",
  });
  if (classification.command === "OPERATIONS_PHOTO_STATUS") return Object.freeze({
    kind: "REPLY" as const,
    reply: "[K-LOL.GG 사진 제출 안내]\nV4 휴대폰 봇은 사진 세션 업로드를 사용하지 않습니다.\n사이트에 로그인해 사진을 제출해 주세요.\n\n내전 결과 사진:\nhttps://k-lol-gg.vercel.app/matches/submit\n\n경고 차감 사진:\nhttps://k-lol-gg.vercel.app/discipline/evidence",
  });
  if (classification.command === "OPERATIONS_INHOUSE_PREVIEW_CANCEL" || classification.command === "OPERATIONS_INHOUSE_CONFIRM") {
    return Object.freeze({
      kind: "REPLY" as const,
      reply: "[K-LOL.GG 내전 신청 안내]\n내전 미리보기·확인 코드 방식은 사용하지 않습니다.\n봇이 출력한 협곡 전체 양식을 수정해 전송하면 서버의 최종 명단으로 즉시 반영됩니다.\n이 명령으로 변경된 내용은 없습니다.",
    });
  }
  if (classification.audience === "INTERNAL") return null;
  return null;
}

function deterministicFallback(classification: KakaoV4CommandClassification): DispatchResult {
  if (classification.kind === "UNKNOWN" || classification.audience === "INTERNAL") throw new KakaoV4CommandError("INVALID_FORM");
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
    });
    const receiptKey = `${envelope.installationId}:${envelope.eventId}`;
    const digest = envelopeDigest(envelope);
    const current = this.receipts.get(receiptKey);
    if (current) {
      if (current.digest !== digest) throw new KakaoV4CommandError("IDEMPOTENCY_MISMATCH");
      return Object.freeze({ ...current.result, replayed: true });
    }
    const classification = classifyKakaoV4Command({ profileId: envelope.profileId, text: envelope.text });
    if (
      classification.kind !== "UNKNOWN" && classification.audience === "INTERNAL" &&
      classification.command !== "LOCAL_V4_STATUS" && classification.command !== "LOCAL_V4_CONTRACT"
    ) throw new KakaoV4CommandError("INVALID_FORM");
    if (classification.kind === "WRONG_PROFILE") throw new KakaoV4CommandError("WRONG_PROFILE");
    let result = localReply(envelope, classification);
    let replayed = false;
    if (!result && this.dispatcher) {
      const canonical = canonicalizeKakaoV4Command(classification, envelope);
      if (canonical?.domain === "OPERATIONS" && canonical.action === "INVALID_FORM") {
        result = Object.freeze({
          kind: "REPLY" as const,
          reply: `[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: ${canonical.missingFields.join(", ")}`,
        });
      } else if (canonical) {
        const dispatched = await this.dispatcher.dispatch({ envelope, keyId, requestDigestHex: metadata?.requestDigestHex ?? digest, requestId: metadata?.requestId ?? envelope.eventId, authorization }, canonical);
        result = Object.freeze({ kind: "REPLY" as const, reply: dispatched.legacyReply });
        replayed = dispatched.replayed;
      } else if (classification.kind === "SNAPSHOT") {
        throw new KakaoV4CommandError("INVALID_FORM");
      }
    }
    if (!result) {
      if (this.dispatcher) throw new KakaoV4CommandError("INVALID_FORM");
      result = deterministicFallback(classification);
    }
    if (this.receipts.size >= 1_024) this.receipts.delete(this.receipts.keys().next().value as string);
    this.receipts.set(receiptKey, Object.freeze({ digest, result }));
    return Object.freeze({ ...result, replayed });
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
