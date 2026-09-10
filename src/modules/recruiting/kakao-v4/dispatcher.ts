import { createHash } from "node:crypto";

import type { KakaoProfileAuthorization } from "../kakao-access/postgres-kakao-room-registry";
import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import {
  KAKAO_V4_EVENT_SCOPE,
  hashKakaoV4EventId,
  sealRecruitingCommand,
  type RecruitingCommand,
} from "../application/commands";
import type { RecruitingCommandResult } from "../application/ports";
import type {
  KakaoOpenChatStatusDto,
  KakaoPlayerRecordDto,
  KakaoRankingDto,
  KakaoSeasonSnapshotCommand,
  KakaoSeasonSnapshotDto,
} from "../kakao-assistant/domain";
import type { KakaoV4CommandEnvelope } from "./domain";
import {
  requiredProfileForKakaoV4Command,
  type CanonicalKakaoV4Command,
  type KakaoV4RecruitTarget,
} from "./canonical-command";

type SignedAssistantInput = Readonly<{
  actorPrincipalId: string;
  intent: VerifiedKakaoWebhookIntent;
  requestKey: string;
  scope: string;
}>;

export type KakaoV4RecruitingPort = Readonly<{
  handle(command: RecruitingCommand): Promise<RecruitingCommandResult>;
  resolveCompatTarget(input: Readonly<{
    kind: "PARTY" | "SCRIM";
    sourceRoomId: string;
    recruitDate: string;
    recruitNumber: number;
  }>): Promise<Readonly<{ id: string; revision: number }> | null>;
}>;

export type KakaoV4AssistantPort = Readonly<{
  getOpenChatStatus(input: SignedAssistantInput): Promise<Readonly<{ body: KakaoOpenChatStatusDto; replayed: boolean }>>;
  syncSeasonSnapshot(input: SignedAssistantInput & Readonly<{
    command: KakaoSeasonSnapshotCommand;
    requestId: string;
  }>): Promise<Readonly<{ body: KakaoSeasonSnapshotDto; replayed: boolean }>>;
  getPlayerRecord?(input: SignedAssistantInput & Readonly<{ query: string; mode: "RECORD" | "RECENT" }>): Promise<Readonly<{ body: KakaoPlayerRecordDto; replayed: boolean }>>;
  getRanking?(input: SignedAssistantInput): Promise<Readonly<{ body: KakaoRankingDto; replayed: boolean }>>;
}>;

export type KakaoV4DispatchContext = Readonly<{
  envelope: KakaoV4CommandEnvelope;
  keyId: string;
  requestDigestHex: string;
  requestId: string;
  authorization: KakaoProfileAuthorization;
}>;

export type KakaoV4DispatcherResult = Readonly<{
  kind: "PARTY" | "SCRIM" | "SEASON" | "PLAYER";
  action: CanonicalKakaoV4Command["action"];
  aggregate: unknown;
  legacyReply: string;
  replayed: boolean;
}>;

export class KakaoV4DispatcherError extends Error {
  constructor(readonly code: "PROFILE_MISMATCH" | "NOT_FOUND" | "INVALID_COMMAND") {
    super(code);
    this.name = "KakaoV4DispatcherError";
  }
}

function deterministicAggregateId(eventId: string, domain: "PARTY" | "SCRIM") {
  const hex = createHash("sha256").update(`klol-v4:${domain.toLowerCase()}:aggregate:v1\0${eventId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function actorPrincipalId(envelope: KakaoV4CommandEnvelope) {
  return `bot:kakao:v4:${envelope.installationId}`;
}

function authorizationIntent(context: KakaoV4DispatchContext): VerifiedKakaoWebhookIntent {
  return Object.freeze({
    kind: "KAKAO_HMAC" as const,
    keyId: context.keyId,
    timestampSeconds: context.envelope.timestamp,
    nonce: context.envelope.nonce,
    installationId: context.envelope.installationId,
    deliveryId: context.envelope.eventId,
    roomId: context.authorization.roomId,
    senderId: context.envelope.senderId,
    bodyDigestHex: context.requestDigestHex,
    requireNonceClaim: true as const,
    transactionRecheck: true as const,
  });
}

function signedInput(context: KakaoV4DispatchContext): SignedAssistantInput {
  return Object.freeze({
    actorPrincipalId: actorPrincipalId(context.envelope),
    intent: authorizationIntent(context),
    requestKey: context.envelope.eventId,
    scope: KAKAO_V4_EVENT_SCOPE,
  });
}

function commandMetadata(context: KakaoV4DispatchContext, expectedRevision: number) {
  return {
    actor: {
      kind: "BOT" as const,
      principalId: actorPrincipalId(context.envelope),
      authorizationIntent: authorizationIntent(context),
      commandSource: "KAKAO_V4" as const,
    },
    requestId: context.requestId,
    expectedRevision,
    issuedAt: new Date(context.envelope.timestamp * 1_000).toISOString(),
    idempotency: {
      scope: KAKAO_V4_EVENT_SCOPE,
      keyHash: hashKakaoV4EventId(context.envelope.eventId),
      requestFingerprint: new Uint8Array(32),
      bodyDigestHex: context.requestDigestHex,
    },
  };
}

function partyLines(party: KakaoOpenChatStatusDto["parties"][number]) {
  const members = party.members.length > 0
    ? party.members.map((member) => `${member.slotNo}. ${member.name}${member.position ? ` / ${member.position}` : ""}`).join("\n")
    : "신청자 없음";
  return [
    `[파티 #${party.recruitNumber}]`,
    party.title,
    `인원: ${party.memberCount}/${party.maximumMembers}`,
    `시작시간: ${party.startTimeText}`,
    `게임정보: ${party.gameInfo}`,
    members,
  ].join("\n");
}

function partyStatusReply(parties: KakaoOpenChatStatusDto["parties"]) {
  if (parties.length === 0) return "[K-LOL.GG 현재 구인 현황]\n진행 중인 파티가 없습니다.";
  return `[K-LOL.GG 현재 구인 현황]\n\n${parties.map(partyLines).join("\n\n")}`;
}

function scrimLines(scrim: KakaoOpenChatStatusDto["scrims"][number]) {
  return [
    `[스크림 #${scrim.scrimNumber}]`,
    `우리팀: ${scrim.requesterTeamName ?? "미입력"}`,
    `상대팀: ${scrim.opponentTeamName ?? "모집 중"}`,
    `상태: ${scrim.status}`,
    `경기: ${scrim.bestOf}판`,
  ].join("\n");
}

function scrimStatusReply(scrims: KakaoOpenChatStatusDto["scrims"]) {
  if (scrims.length === 0) return "[K-LOL.GG 스크림 현황]\n진행 중인 스크림이 없습니다.";
  return `[K-LOL.GG 스크림 현황]\n\n${scrims.map(scrimLines).join("\n\n")}`;
}

const DEPRECATED_SCRIM_REPLIES = Object.freeze({
  DEPRECATED_JOIN: "[K-LOL.GG 스크림 참가 명령 사용 안 함]\n스크림 양식에 직접 입력해주세요.",
  DEPRECATED_CONFIRM: "[K-LOL.GG 스크림 확정 명령 사용 안 함]\n최신 스크림 양식을 다시 보내주세요.",
  DEPRECATED_CANCEL: "[K-LOL.GG 스크림 취소 명령 사용 안 함]\n스크림은 오전 6시에 자동 종료됩니다.",
  DEPRECATED_FINISH: "[K-LOL.GG 스크림 수동 종료 사용 안 함]\n스크림은 매일 오전 6시에 자동 종료됩니다.",
});

function playerRecordReply(body: KakaoPlayerRecordDto) {
  const title = body.player ? `${body.player.displayName}#${body.player.riotId}` : body.query;
  if (!body.player) return `[${title} ${body.mode === "RECENT" ? "최근 경기" : "전적"}]\n플레이어를 찾을 수 없습니다.`;
  const recent = body.recentMatches.slice(0, body.mode === "RECENT" ? 10 : 1).map((match, index) => `${index + 1}. ${match.won ? "승" : "패"} | ${match.championName} | ${match.playedOn}`);
  if (body.mode === "RECENT") return `[${title} 최근 경기]\n\n${recent.length > 0 ? recent.join("\n") : "최근 경기 없음"}`;
  const summary = body.summary;
  return [`[${title} 전적]`, `시즌: ${body.season?.name ?? "없음"}`, summary ? `참여: ${summary.participationCount}회 / ${summary.totalGames}세트` : "참여: 0회 / 0세트", summary ? `전적: ${summary.wins}승 ${summary.losses}패 (${summary.winRate.toFixed(1)}%)` : "전적: 없음", recent.length > 0 ? `최근: ${recent[0]!.replace(/^1\.\s*/u, "")}` : "최근: 없음"].join("\n");
}

function rankingReply(body: KakaoRankingDto) {
  const rows = body.rows.slice(0, 5).map((row) => `${row.rank}. ${row.displayName}#${row.riotId} | 승률 ${row.winRate.toFixed(1)}% | 참여 ${row.participationCount}회`);
  return ["🏆 K-LOL.GG 랭킹 TOP 5", `기준: 내전 참여 ${body.minimumParticipation}회 이상`, "", ...(rows.length > 0 ? rows : ["표시할 랭킹이 없습니다."])].join("\n");
}

function seasonReply(body: KakaoSeasonSnapshotDto) {
  if (body.legacyReply) return body.legacyReply;
  return [
    "[K-LOL.GG 내전 신청 반영]",
    `신청일: ${body.applyDate}${body.recruitNo === null ? "" : ` · 회차: #${body.recruitNo}`}`,
    `현재 ${body.entries.length}명 · 추가 ${body.createdCount ?? 0} · 수정 ${body.updatedCount ?? 0} · 취소 ${body.cancelledCount}`,
  ].join("\n");
}

export class KakaoV4CommandDispatcher {
  constructor(private readonly dependencies: Readonly<{
    recruiting: KakaoV4RecruitingPort;
    assistant: KakaoV4AssistantPort;
  }>) {}

  async dispatch(context: KakaoV4DispatchContext, command: CanonicalKakaoV4Command): Promise<KakaoV4DispatcherResult> {
    const requiredProfile = requiredProfileForKakaoV4Command(command);
    if (
      context.envelope.profileId !== requiredProfile ||
      context.authorization.capabilityProfile !== requiredProfile
    ) throw new KakaoV4DispatcherError("PROFILE_MISMATCH");

    if (command.domain === "PARTY") return this.party(context, command);
    if (command.domain === "SCRIM") return this.scrim(context, command);
    if (command.domain === "PLAYER") return this.player(context, command);
    return this.season(context, command);
  }

  private async player(context: KakaoV4DispatchContext, command: Extract<CanonicalKakaoV4Command, { domain: "PLAYER" }>): Promise<KakaoV4DispatcherResult> {
    if (command.action === "RANKING") {
      if (!this.dependencies.assistant.getRanking) throw new KakaoV4DispatcherError("INVALID_COMMAND");
      const result = await this.dependencies.assistant.getRanking(signedInput(context));
      return Object.freeze({ kind: "PLAYER", action: command.action, aggregate: result.body, legacyReply: rankingReply(result.body), replayed: result.replayed });
    }
    if (!this.dependencies.assistant.getPlayerRecord) throw new KakaoV4DispatcherError("INVALID_COMMAND");
    const result = await this.dependencies.assistant.getPlayerRecord({ ...signedInput(context), query: command.query, mode: command.action });
    return Object.freeze({ kind: "PLAYER", action: command.action, aggregate: result.body, legacyReply: playerRecordReply(result.body), replayed: result.replayed });
  }

  private async openChatStatus(context: KakaoV4DispatchContext) {
    return this.dependencies.assistant.getOpenChatStatus(signedInput(context));
  }

  private async resolve(context: KakaoV4DispatchContext, kind: "PARTY" | "SCRIM", target: KakaoV4RecruitTarget) {
    const resolved = await this.dependencies.recruiting.resolveCompatTarget({
      kind,
      sourceRoomId: context.authorization.roomId,
      recruitDate: target.recruitDate,
      recruitNumber: target.recruitNumber,
    });
    if (!resolved) throw new KakaoV4DispatcherError("NOT_FOUND");
    return resolved;
  }

  private async party(
    context: KakaoV4DispatchContext,
    command: Extract<CanonicalKakaoV4Command, { domain: "PARTY" }>,
  ): Promise<KakaoV4DispatcherResult> {
    if (command.action === "STATUS" || command.action === "DETAIL") {
      const status = await this.openChatStatus(context);
      const parties = command.action === "STATUS"
        ? status.body.parties
        : status.body.parties.filter((party) => party.recruitDate === command.target.recruitDate && party.recruitNumber === command.target.recruitNumber);
      if (command.action === "DETAIL" && parties.length === 0) throw new KakaoV4DispatcherError("NOT_FOUND");
      return Object.freeze({
        kind: "PARTY" as const,
        action: command.action,
        aggregate: command.action === "DETAIL" ? parties[0] : parties,
        legacyReply: command.action === "DETAIL" ? partyLines(parties[0]!) : partyStatusReply(parties),
        replayed: status.replayed,
      });
    }

    let recruitingCommand: RecruitingCommand;
    if (command.action === "CREATE") {
      recruitingCommand = sealRecruitingCommand({
        type: "CREATE_PARTY",
        aggregateId: deterministicAggregateId(context.envelope.eventId, "PARTY"),
        metadata: commandMetadata(context, 0),
        payload: {
          recruitDate: command.payload.recruitDate,
          resetSequence: null,
          recruitNumber: command.payload.preferredRecruitNumber,
          partyType: command.payload.partyType,
          title: command.payload.title,
          maximumMembers: command.payload.maximumMembers,
          members: command.payload.members,
          startTimeText: command.payload.startTimeText,
          gameInfo: command.payload.gameInfo,
          scheduledStartAt: command.payload.scheduledStartAt,
          protectedUntil: command.payload.protectedUntil,
        },
      });
    } else {
      const target = await this.resolve(context, "PARTY", command.target);
      recruitingCommand = command.action === "SYNC"
        ? sealRecruitingCommand({
            type: "SYNC_PARTY",
            aggregateId: target.id,
            metadata: commandMetadata(context, target.revision),
            payload: command.payload,
          })
        : sealRecruitingCommand({
            type: "FINISH_PARTY",
            aggregateId: target.id,
            metadata: commandMetadata(context, target.revision),
            payload: {},
          });
    }
    const result = await this.dependencies.recruiting.handle(recruitingCommand);
    const data = result.body.data;
    const legacyReply = command.action === "CREATE"
      ? [
          "[K-LOL.GG 파티 모집]",
          `모집번호: #${String(data.recruitNumber)}`,
          command.payload.title,
          ...Array.from({ length: command.payload.maximumMembers }, (_, index) => `${index + 1}.`),
        ].join("\n")
      : command.action === "FINISH"
        ? `[K-LOL.GG 파티 마감]\n#${String(data.recruitNumber)} 모집을 마감했습니다.`
        : [
            `[K-LOL.GG 파티 #${String(data.recruitNumber)} 반영]`,
            `인원: ${String(data.memberCount)}/${String(data.maximumMembers)}`,
            `시작시간: ${String(data.startTimeText)}`,
            `게임정보: ${String(data.gameInfo)}`,
            ...command.payload.members.map((member) => `${member.slotNo}. ${member.name}`),
          ].join("\n");
    return Object.freeze({ kind: "PARTY", action: command.action, aggregate: result.body, legacyReply, replayed: result.replayed });
  }

  private async scrim(
    context: KakaoV4DispatchContext,
    command: Extract<CanonicalKakaoV4Command, { domain: "SCRIM" }>,
  ): Promise<KakaoV4DispatcherResult> {
    if (
      command.action === "DEPRECATED_JOIN" ||
      command.action === "DEPRECATED_CONFIRM" ||
      command.action === "DEPRECATED_CANCEL" ||
      command.action === "DEPRECATED_FINISH"
    ) {
      const status = await this.openChatStatus(context);
      return Object.freeze({
        kind: "SCRIM",
        action: command.action,
        aggregate: null,
        legacyReply: DEPRECATED_SCRIM_REPLIES[command.action],
        replayed: status.replayed,
      });
    }
    if (command.action === "STATUS" || command.action === "DETAIL") {
      const status = await this.openChatStatus(context);
      const scrims = command.action === "STATUS"
        ? status.body.scrims
        : status.body.scrims.filter((scrim) => scrim.recruitDate === command.target.recruitDate && scrim.scrimNumber === command.target.recruitNumber);
      if (command.action === "DETAIL" && scrims.length === 0) throw new KakaoV4DispatcherError("NOT_FOUND");
      return Object.freeze({
        kind: "SCRIM",
        action: command.action,
        aggregate: command.action === "DETAIL" ? scrims[0] : scrims,
        legacyReply: command.action === "DETAIL" ? scrimLines(scrims[0]!) : scrimStatusReply(scrims),
        replayed: status.replayed,
      });
    }

    let recruitingCommand: RecruitingCommand;
    if (command.action === "CREATE") {
      recruitingCommand = sealRecruitingCommand({
        type: "CREATE_SCRIM",
        aggregateId: deterministicAggregateId(context.envelope.eventId, "SCRIM"),
        metadata: commandMetadata(context, 0),
        payload: command.payload,
      });
    } else if (command.action === "SYNC") {
      const target = await this.resolve(context, "SCRIM", command.target);
      recruitingCommand = sealRecruitingCommand({
        type: "SYNC_SCRIM",
        aggregateId: target.id,
        metadata: commandMetadata(context, target.revision),
        payload: command.payload,
      });
    } else {
      throw new KakaoV4DispatcherError("INVALID_COMMAND");
    }
    const result = await this.dependencies.recruiting.handle(recruitingCommand);
    return Object.freeze({
      kind: "SCRIM",
      action: command.action,
      aggregate: result.body,
      legacyReply: command.action === "CREATE"
        ? "[K-LOL.GG 스크림 등록 완료]"
        : `[스크림 #${String(result.body.data.scrimNumber)} 반영]\n상태: ${String(result.body.status)}`,
      replayed: result.replayed,
    });
  }

  private async season(
    context: KakaoV4DispatchContext,
    command: Extract<CanonicalKakaoV4Command, { domain: "SEASON" }>,
  ): Promise<KakaoV4DispatcherResult> {
    const seasonCommand: KakaoSeasonSnapshotCommand = command.action === "SYNC"
      ? {
          action: "SYNC",
          seasonId: command.seasonId,
          applyDate: command.applyDate,
          recruitNo: command.recruitNumber,
          mode: command.mode,
          participants: command.participants,
        }
      : {
          action: "STATUS",
          seasonId: command.seasonId,
          applyDate: command.applyDate,
          recruitNo: command.action === "DETAIL" ? command.recruitNumber : null,
          participants: [],
        };
    const result = await this.dependencies.assistant.syncSeasonSnapshot({
      ...signedInput(context),
      command: seasonCommand,
      requestId: context.requestId,
    });
    return Object.freeze({
      kind: "SEASON",
      action: command.action,
      aggregate: result.body,
      legacyReply: seasonReply(result.body),
      replayed: result.replayed,
    });
  }
}
