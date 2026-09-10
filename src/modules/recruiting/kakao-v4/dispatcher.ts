import { createHash } from "node:crypto";

import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import {
  KAKAO_V4_EVENT_SCOPE,
  hashKakaoV4EventId,
  sealRecruitingCommand,
  type RecruitingCommand,
} from "../application/commands";
import type { RecruitingCommandResult } from "../application/ports";
import type { OperationFormPayloadByType, OperationFormType } from "../operation-forms/domain";
import type { OperationFormMutationResult } from "../operation-forms/postgres-operation-forms";
import type {
  KakaoOpenChatStatusDto,
  KakaoPlayerRecordDto,
  KakaoRankingDto,
  KakaoScheduledNoticeDto,
  KakaoSeasonSnapshotCommand,
  KakaoSeasonSnapshotDto,
  KakaoV4StaticReceiptDto,
} from "../kakao-assistant/domain";
import type { KakaoV4CommandEnvelope } from "./domain";
import type { KakaoV4InstallationAuthorization } from "./installation-scope";
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
  resolveScrimUpsert(input: Readonly<{
    sourceRoomId: string;
    recruitDate: string;
    requestedScrimNumber: number | null;
  }>): Promise<Readonly<{
    scrimNumber: number;
    existing: KakaoOpenChatStatusDto["scrims"][number] | null;
  }> | null>;
}>;

export type KakaoV4AssistantPort = Readonly<{
  getOpenChatStatus(input: SignedAssistantInput): Promise<Readonly<{ body: KakaoOpenChatStatusDto; replayed: boolean }>>;
  syncSeasonSnapshot(input: SignedAssistantInput & Readonly<{
    command: KakaoSeasonSnapshotCommand;
    requestId: string;
  }>): Promise<Readonly<{ body: KakaoSeasonSnapshotDto; replayed: boolean }>>;
  getPlayerRecord?(input: SignedAssistantInput & Readonly<{ query: string; mode: "RECORD" | "RECENT" }>): Promise<Readonly<{ body: KakaoPlayerRecordDto; replayed: boolean }>>;
  getRanking?(input: SignedAssistantInput): Promise<Readonly<{ body: KakaoRankingDto; replayed: boolean }>>;
  getScheduledNotice?(input: SignedAssistantInput & Readonly<{ slot: string | null }>): Promise<Readonly<{ body: KakaoScheduledNoticeDto; replayed: boolean }>>;
  recordV4StaticReply?(input: SignedAssistantInput & Readonly<{ legacyReply: string }>): Promise<Readonly<{ body: KakaoV4StaticReceiptDto; replayed: boolean }>>;
}>;

export type KakaoV4OperationFormsPort = Readonly<{
  submit(input: Readonly<{
    actorPrincipalId: string;
    intent: VerifiedKakaoWebhookIntent;
    requestId: string;
    idempotency: Readonly<{ requestKey: string; bodyDigestHex: string; eventScope: typeof KAKAO_V4_EVENT_SCOPE }>;
    formType: OperationFormType;
    payload: OperationFormPayloadByType[OperationFormType];
  }>): Promise<OperationFormMutationResult>;
}>;

export type KakaoV4DispatchContext = Readonly<{
  envelope: KakaoV4CommandEnvelope;
  keyId: string;
  requestDigestHex: string;
  requestId: string;
  authorization: KakaoV4InstallationAuthorization;
}>;

export type KakaoV4DispatcherResult = Readonly<{
  kind: "PARTY" | "SCRIM" | "SEASON" | "PLAYER" | "OPERATIONS";
  action: CanonicalKakaoV4Command["action"];
  aggregate: unknown;
  legacyReply: string;
  replayed: boolean;
}>;

export class KakaoV4DispatcherError extends Error {
  constructor(
    readonly code: "PROFILE_MISMATCH" | "NOT_FOUND" | "INVALID_COMMAND" | "INVALID_FORM" | "UNAVAILABLE",
    readonly missingFields: readonly string[] = Object.freeze([]),
  ) {
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
  return `#${scrim.scrimNumber} ${scrim.requesterTeamName ?? "요청팀 미정"} vs ${scrim.opponentTeamName ?? "상대구함"} / ${scrimTime(scrim)} / ${scrimRule(scrim)} / ${scrimStatusLabel(scrim.status)}`;
}

function scrimStatusReply(scrims: KakaoOpenChatStatusDto["scrims"]) {
  if (scrims.length === 0) return "[K-LOL.GG 스크림 현황]\n\n현재 모집중/확정된 스크림이 없습니다.";
  return `[K-LOL.GG 스크림 현황]\n🔎 전체 양식: 스크림상세 번호\n\n${scrims.map((scrim) => `${scrimLines(scrim)}\n└ 스크림상세 ${scrim.scrimNumber}`).join("\n")}`;
}

function scrimStatusLabel(status: string) {
  const labels: Readonly<Record<string, string>> = {
    RECRUITING: "모집중", MATCHED: "매칭완료", CONFIRMED: "확정",
    COMPLETED: "완료", CANCELED: "취소", CANCELLED: "취소",
  };
  return labels[status] ?? status;
}

function scrimTime(scrim: Pick<KakaoOpenChatStatusDto["scrims"][number], "scheduledAt">) {
  if (!scrim.scheduledAt) return "미정";
  const value = new Date(scrim.scheduledAt);
  if (Number.isNaN(value.getTime())) return "미정";
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1_000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

function scrimRule(scrim: Pick<KakaoOpenChatStatusDto["scrims"][number], "seriesRuleText" | "bestOf">) {
  return scrim.seriesRuleText ?? (scrim.bestOf ? `${scrim.bestOf}판` : "판수 미정");
}

function scrimFormLines(scrim: KakaoOpenChatStatusDto["scrims"][number]) {
  const requester = scrim.requesterLineup ?? { top: null, jungle: null, mid: null, adc: null, support: null };
  const opponent = scrim.opponentLineup ?? { top: null, jungle: null, mid: null, adc: null, support: null };
  return [
    `운영일: ${scrim.recruitDate}`,
    `번호: #${scrim.scrimNumber}`,
    `일시: ${scrimTime(scrim)}`,
    `방식: ${scrimRule(scrim)}`,
    "",
    `우리팀: ${scrim.requesterTeamName ?? ""}`,
    `TOP: ${requester.top ?? ""}`,
    `JUG: ${requester.jungle ?? ""}`,
    `MID: ${requester.mid ?? ""}`,
    `ADC: ${requester.adc ?? ""}`,
    `SUP: ${requester.support ?? ""}`,
    "",
    `상대팀: ${scrim.opponentTeamName ?? ""}`,
    `TOP: ${opponent.top ?? ""}`,
    `JUG: ${opponent.jungle ?? ""}`,
    `MID: ${opponent.mid ?? ""}`,
    `ADC: ${opponent.adc ?? ""}`,
    `SUP: ${opponent.support ?? ""}`,
  ];
}

function scrimDetailReply(scrim: KakaoOpenChatStatusDto["scrims"][number]) {
  return ["[K-LOL.GG 멸망전 스크림 상세]", "", scrimLines(scrim), "", ...scrimFormLines(scrim), "", "수정: 이 메시지를 복사해 내용을 고친 뒤 전체 전송"].join("\n");
}

function scrimTemplate(recruitDate: string) {
  return [
    "[K-LOL.GG 스크림 구인 양식]", "", `운영일: ${recruitDate}`, "번호: #자동배정", "",
    "일시: ", "방식: 3판2선", "", "우리팀: ", "TOP: ", "JUG: ", "MID: ", "ADC: ", "SUP: ", "",
    "상대팀: ", "TOP: ", "JUG: ", "MID: ", "ADC: ", "SUP: ",
  ].join("\n");
}

const INHOUSE_MODE_SELECTION = [
  "[K-LOL.GG 내전 종목 선택]",
  "지원하지 않는 종목입니다: 양식",
  "✅️협곡내전은 관리자에게 신청 후 안내에 따라 구인해주세요.✅️",
  "",
  "아래 명령어 중 하나를 입력해주세요.",
  "- /내전구인 협곡",
  "- /내전구인 칼바람",
  "- /내전구인 증바람",
  "",
  "날짜·시간 지정: /내전구인 협곡 2026-08-06 21:00",
  "모집번호·정원 지정: /내전구인 칼바람 #2 10명",
  "",
  "협곡은 티어·라인 양식으로 내전 명단에 등록됩니다.",
  "칼바람·증바람은 이름만 모집하며 내전 명단에는 등록되지 않습니다.",
].join("\n");

function inhouseTemplate(command: Extract<CanonicalKakaoV4Command, { domain: "SEASON"; action: "TEMPLATE" }>) {
  if (!command.mode) return INHOUSE_MODE_SELECTION;
  const mode = command.mode === "RIFT" ? "협곡" : command.mode === "ARAM" ? "칼바람" : "증바람";
  const lines = [
    `📢 내전하실분 #${command.recruitNumber}`,
    ` 》${mode}`,
    ` 》${command.applyDate} ${command.time} 시작`,
    `👥 0/${command.capacity}명`,
    "",
    "*참가 신청 양식*",
  ];
  lines.push(...(command.mode === "RIFT"
    ? ["이름/현티어/최고티어/주라인/부라인", "EX) 1.지후/P/E/AD/MD"]
    : ["이름", "EX) 1.지후"]), "");
  for (let slot = 1; slot <= command.capacity; slot += 1) lines.push(`${slot}.`);
  return lines.join("\n");
}

function participationGuide(publicOrigin: string) {
  return [
    "[K-LOL.GG 내전 참가 방법 안내]",
    "오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다.",
    "",
    "1. K-LOL.GG 접속",
    publicOrigin,
    "2. 로그인",
    "3. 시즌내전 참가하기 클릭",
    "4. 주 포지션 / 부 포지션 선택",
    "5. 참가 신청 완료",
    "",
    "참가 신청 기준으로 팀 밸런스가 진행됩니다.",
    "신청하지 않은 인원은 팀 편성에서 누락될 수 있습니다.",
  ].join("\n");
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

const OPERATION_STATIC_REPLIES = Object.freeze({
  REGISTRATION_HUB: [
    "[K-LOL.GG 쉬운 등록 센터]",
    "처음 사용하셔도 괜찮아요. 필요한 항목의 링크를 누르면 됩니다.",
    "▶ https://k-lol-gg.vercel.app/start", "",
    "① 내전 결과 등록",
    "경기 정보와 결과 사진 2~3장을 한 화면에서 제출합니다.",
    "▶ https://k-lol-gg.vercel.app/matches/submit", "",
    "② 주의·경고·벤 등록 (관리자)",
    "대상 검색부터 사유·근거 사진 등록까지 한 화면에서 처리합니다.",
    "▶ https://k-lol-gg.vercel.app/admin/discipline/new",
    "※ 관리자 로그인이 필요하며, 권한이 없으면 등록할 수 없습니다.", "",
    "③ 경고 차감 사진 제출",
    "본인의 진행 과제를 선택하고 남은 사진을 한 번에 제출합니다.",
    "▶ https://k-lol-gg.vercel.app/discipline/evidence",
    "※ 본인 계정 로그인이 필요합니다.", "",
    "등록과 사진 제출은 로그인한 본인 계정 기준으로 처리됩니다.",
  ].join("\n"),
  INHOUSE_RESULT: [
    "[K-LOL.GG 내전 결과 등록]", "가장 쉬운 등록 방법을 안내합니다.", "",
    "1. 아래 링크를 엽니다.", "2. 세트 수·회차·팀 밸런스를 확인합니다.",
    "3. 결과 사진 2~3장을 한 번에 올리고 제출합니다.", "",
    "▶ https://k-lol-gg.vercel.app/matches/submit", "",
    "로그인하면 진행 중인 제출을 자동으로 찾아 이어서 할 수 있습니다.",
  ].join("\n"),
  INHOUSE_RESULT_STATUS: [
    "[K-LOL.GG 내전 결과 제출 현황]",
    "사이트에 로그인하면 진행 중인 내 제출을 자동으로 확인할 수 있습니다.", "",
    "▶ https://k-lol-gg.vercel.app/matches/submit",
  ].join("\n"),
  DISCIPLINE_CREATE: [
    "[K-LOL.GG 관리자 경고 등록]",
    "관리자 화면에서 대상 검색 → 종류 선택 → 사유·사진 등록 순서로 진행합니다.", "",
    "▶ https://k-lol-gg.vercel.app/admin/discipline/new", "",
    "※ 관리자 로그인과 2차 인증이 필요하며, 완료 후 이 화면으로 돌아옵니다.",
  ].join("\n"),
  DISCIPLINE_EVIDENCE: [
    "[K-LOL.GG 경고 차감 사진 제출]",
    "사이트에 로그인하면 본인의 진행 과제만 자동으로 표시됩니다.",
    "로그인 계정 기준으로 남은 사진을 한 번에 제출할 수 있습니다.", "",
    "▶ https://k-lol-gg.vercel.app/discipline/evidence",
  ].join("\n"),
  DISCIPLINE_STATUS: [
    "[K-LOL.GG 내 경고 현황]", "내정보에서 경고 상태와 남은 사진 수를 확인하세요.", "",
    "▶ https://k-lol-gg.vercel.app/account#discipline",
  ].join("\n"),
});

function scheduledNoticeReply(body: KakaoScheduledNoticeDto) {
  const labels = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;
  const shortageLabels = body.shortagePositions.map((position) => labels[position]);
  return [
    "[K-LOL.GG 내전 공지 미리보기]",
    "읽기 전용 미리보기이며 실제 방 자동 발송은 하지 않았습니다.",
    `날짜: ${body.date}${body.slot ? ` · 시간: ${body.slot}시` : ""}`,
    body.seasonId ? "활성 시즌 신청 현황" : "활성 시즌이 없습니다.",
    `신청 ${body.total}/${body.targetCount} · 남은 인원 ${body.remaining}명`,
    `포지션: 탑 ${body.positionCounts.TOP} · 정글 ${body.positionCounts.JGL} · 미드 ${body.positionCounts.MID} · 원딜 ${body.positionCounts.ADC} · 서포터 ${body.positionCounts.SUP}`,
    `부족 포지션: ${shortageLabels.length > 0 ? shortageLabels.join(", ") : "없음"}`,
  ].join("\n");
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
    publicOrigin?: string;
    operationForms?: KakaoV4OperationFormsPort;
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
    if (command.domain === "OPERATIONS") return this.operations(context, command);
    return this.season(context, command);
  }

  private async operations(
    context: KakaoV4DispatchContext,
    command: Extract<CanonicalKakaoV4Command, { domain: "OPERATIONS" }>,
  ): Promise<KakaoV4DispatcherResult> {
    if (command.action === "SUBMIT_FORM") {
      if (!this.dependencies.operationForms) throw new KakaoV4DispatcherError("UNAVAILABLE");
      const result = await this.dependencies.operationForms.submit({
        actorPrincipalId: actorPrincipalId(context.envelope),
        intent: authorizationIntent(context),
        requestId: context.requestId,
        idempotency: {
          requestKey: context.envelope.eventId,
          bodyDigestHex: context.requestDigestHex,
          eventScope: KAKAO_V4_EVENT_SCOPE,
        },
        formType: command.formType,
        payload: command.payload,
      });
      const embeddedReply = typeof result.body.reply === "string" ? result.body.reply : null;
      return Object.freeze({
        kind: "OPERATIONS",
        action: command.action,
        aggregate: result.body,
        legacyReply: embeddedReply ?? `[K-LOL.GG 운영 양식]\n${command.formType} 양식을 접수했습니다.`,
        replayed: result.replayed,
      });
    }
    if (command.action === "SCHEDULE_NOTICE") {
      if (!this.dependencies.assistant.getScheduledNotice) throw new KakaoV4DispatcherError("UNAVAILABLE");
      const result = await this.dependencies.assistant.getScheduledNotice({ ...signedInput(context), slot: command.slot });
      return Object.freeze({ kind: "OPERATIONS", action: command.action, aggregate: result.body, legacyReply: scheduledNoticeReply(result.body), replayed: result.replayed });
    }
    if (!this.dependencies.assistant.recordV4StaticReply) throw new KakaoV4DispatcherError("UNAVAILABLE");
    const legacyReply = command.action === "INVALID_FORM"
      ? `[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: ${command.missingFields.join(", ")}`
      : OPERATION_STATIC_REPLIES[command.action];
    const receipt = await this.dependencies.assistant.recordV4StaticReply({ ...signedInput(context), legacyReply });
    if (command.action === "INVALID_FORM") throw new KakaoV4DispatcherError("INVALID_FORM", command.missingFields);
    return Object.freeze({
      kind: "OPERATIONS",
      action: command.action,
      aggregate: receipt.body,
      legacyReply: receipt.body.legacyReply,
      replayed: receipt.replayed,
    });
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
    if (command.action === "TEMPLATE") {
      return Object.freeze({
        kind: "SCRIM",
        action: command.action,
        aggregate: null,
        legacyReply: scrimTemplate(command.recruitDate),
        replayed: false,
      });
    }
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
        legacyReply: command.action === "DETAIL" ? scrimDetailReply(scrims[0]!) : scrimStatusReply(scrims),
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
    } else if (command.action === "UPSERT") {
      const resolution = command.payload.scrimNumber === null ? null : await this.dependencies.recruiting.resolveScrimUpsert({
        sourceRoomId: context.authorization.roomId,
        recruitDate: command.payload.recruitDate,
        requestedScrimNumber: command.payload.scrimNumber,
      });
      if (command.payload.scrimNumber !== null && !resolution) throw new KakaoV4DispatcherError("INVALID_COMMAND");
      const scrimNumber = resolution?.scrimNumber ?? null;
      const existing = resolution?.existing ?? null;
      const payload = {
        recruitDate: command.payload.recruitDate,
        scrimNumber,
        tournamentId: existing?.tournamentId ?? null,
        legacyTournamentNumber: command.payload.legacyTournamentNumber ?? existing?.legacyTournamentNumber ?? null,
        requesterTeamId: existing?.requesterTeamId ?? null,
        opponentTeamId: existing?.opponentTeamId ?? null,
        title: command.payload.title,
        requesterTeamName: command.payload.requesterTeamName,
        opponentTeamName: command.payload.opponentTeamName,
        requesterLineup: command.payload.requesterLineup,
        opponentLineup: command.payload.opponentLineup,
        memo: command.payload.memo,
        seriesRuleText: command.payload.seriesRuleText,
        scheduledAt: command.payload.scheduledAt,
        bestOf: command.payload.bestOf,
      };
      recruitingCommand = existing
        ? sealRecruitingCommand({
            type: "SYNC_SCRIM",
            aggregateId: existing.id,
            metadata: commandMetadata(context, existing.revision),
            payload: { ...payload, scrimNumber: existing.scrimNumber },
          })
        : sealRecruitingCommand({
            type: "CREATE_SCRIM",
            aggregateId: deterministicAggregateId(context.envelope.eventId, "SCRIM"),
            metadata: commandMetadata(context, 0),
            payload,
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
    const resultScrim = result.body.data as unknown as KakaoOpenChatStatusDto["scrims"][number];
    return Object.freeze({
      kind: "SCRIM",
      action: command.action,
      aggregate: result.body,
      legacyReply: recruitingCommand.type === "CREATE_SCRIM"
        ? "[K-LOL.GG 스크림 등록 완료]"
        : command.action === "UPSERT"
          ? [`[스크림 #${resultScrim.scrimNumber} 반영]`, `상태: ${scrimStatusLabel(resultScrim.status)}`, "", ...scrimFormLines(resultScrim)].join("\n")
          : `[스크림 #${String(result.body.data.scrimNumber)} 반영]\n상태: ${String(result.body.status)}`,
      replayed: result.replayed,
    });
  }

  private async season(
    context: KakaoV4DispatchContext,
    command: Extract<CanonicalKakaoV4Command, { domain: "SEASON" }>,
  ): Promise<KakaoV4DispatcherResult> {
    if (command.action === "TEMPLATE") {
      return Object.freeze({ kind: "SEASON", action: command.action, aggregate: null, legacyReply: inhouseTemplate(command), replayed: false });
    }
    if (command.action === "JOIN_GUIDE") {
      const publicOrigin = (this.dependencies.publicOrigin ?? "https://k-lol-gg.vercel.app").replace(/\/$/u, "");
      return Object.freeze({ kind: "SEASON", action: command.action, aggregate: null, legacyReply: participationGuide(publicOrigin), replayed: false });
    }
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
