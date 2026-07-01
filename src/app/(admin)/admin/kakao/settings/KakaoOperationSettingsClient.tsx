"use client";

import { useMemo, useState } from "react";
import type { KakaoOperationSettings } from "@/lib/kakao/settings";
import styles from "./KakaoOperationSettingsClient.module.css";

type Props = {
  initialSettings: KakaoOperationSettings;
};

type BooleanSettingKey = {
  [K in keyof KakaoOperationSettings]: KakaoOperationSettings[K] extends boolean ? K : never;
}[keyof KakaoOperationSettings];

type NumberSettingKey = {
  [K in keyof KakaoOperationSettings]: KakaoOperationSettings[K] extends number ? K : never;
}[keyof KakaoOperationSettings];

type StringSettingKey = {
  [K in keyof KakaoOperationSettings]: KakaoOperationSettings[K] extends string ? K : never;
}[keyof KakaoOperationSettings];

type NullableStringSettingKey = {
  [K in keyof KakaoOperationSettings]: KakaoOperationSettings[K] extends string | null ? K : never;
}[keyof KakaoOperationSettings];

type ArraySettingKey = {
  [K in keyof KakaoOperationSettings]: KakaoOperationSettings[K] extends string[] ? K : never;
}[keyof KakaoOperationSettings];


const CLIENT_DEFAULT_SETTINGS: KakaoOperationSettings = {
  globalEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: "[K-LOL.GG]\n현재 카카오톡 봇 기능을 점검 중입니다. 잠시 후 다시 이용해주세요.",
  allowedRoomNames: [],
  blockedRoomNames: [],
  blockedSenders: [],
  ignoreBotSender: true,
  botSenderPatterns: ["K-LOL", "구인구직 도우미", "구인도우미", "오픈채팅봇", "봇"],
  recruitCommandEnabled: true,
  recruitHelpCommandEnabled: true,
  recruitCreateCommandEnabled: true,
  recruitJoinCommandEnabled: true,
  recruitFinishCommandEnabled: true,
  recruitResetCommandEnabled: true,
  recruitStatusCommandEnabled: true,
  playerRecordSearchEnabled: true,
  recordCommandEnabled: true,
  recentCommandEnabled: true,
  rankingCommandEnabled: true,
  seasonApplyCommandEnabled: true,
  seasonSnapshotForwardEnabled: true,
  seasonStatusCommandEnabled: true,
  operationFormsEnabled: true,
  friendApplicationEnabled: true,
  leaveRequestEnabled: true,
  meetupRecordEnabled: true,
  suggestionRequestEnabled: true,
  discordInviteRequestEnabled: true,
  helpCommandEnabled: true,
  unknownCommandResponseEnabled: true,
  aiNoticeRedirectEnabled: true,
  commandCooldownSeconds: 0,
  openchatRateLimitPerMinute: 60,
  openchatRateLimitWindowSeconds: 60,
  recruitStatusMaxVisible: 5,
  rankingLimit: 5,
  recentGamesLimit: 5,
  maxMessageLength: 4000,
  responsePrefix: null,
  disabledFeatureMessage: "[K-LOL.GG]\n현재 해당 카카오톡 기능이 관리자 설정에서 중지되어 있습니다.",
  blockedRoomMessage: "[K-LOL.GG]\n현재 이 카카오톡 방에서는 봇 기능을 사용할 수 없습니다.",
  unknownCommandMessage: null,
  notFoundMessage: "검색 결과가 없습니다.\n닉네임#태그를 확인해주세요.",
  errorMessage: "처리 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.",
  helperLinkTitle: "[K-LOL.GG 구인도우미]",
  recruitHelperPath: "/recruit-helper",
  recruitPagePath: "/recruit",
  defaultRoomName: null,
  adminMemo: null,
  logRawMessageEnabled: false,
  debugReplyEnabled: false,
};

const sections: Array<{
  title: string;
  desc: string;
  columns?: "grid2" | "grid3" | "grid4";
  fields: Array<{ key: BooleanSettingKey; label: string; desc: string }>;
}> = [
  {
    title: "전체 운영 스위치",
    desc: "카카오톡 API 전체 사용 여부와 점검 모드를 제어합니다.",
    columns: "grid2",
    fields: [
      { key: "globalEnabled", label: "전체 기능 사용", desc: "OFF면 카카오톡 openchat API가 점검 응답만 반환합니다." },
      { key: "maintenanceMode", label: "점검 모드", desc: "일시 점검 문구를 우선 반환합니다." },
      { key: "ignoreBotSender", label: "봇 발신 무시", desc: "카카오톡 봇/도우미가 보낸 메시지는 재처리하지 않습니다." },
      { key: "debugReplyEnabled", label: "디버그 응답", desc: "응답 JSON에 설정/컨텍스트 디버그 정보를 포함할 수 있습니다." },
    ],
  },
  {
    title: "구인 명령",
    desc: "구인 도움말, 생성, 참가, 마감, 초기화, 현황 계열 명령을 세분화합니다.",
    columns: "grid3",
    fields: [
      { key: "recruitCommandEnabled", label: "구인 명령 전체", desc: "구인 관련 명령의 상위 스위치입니다." },
      { key: "recruitHelpCommandEnabled", label: "구인 도움말", desc: "구인도우미/구인도움말 안내 명령입니다." },
      { key: "recruitCreateCommandEnabled", label: "구인 생성", desc: "파티 구인 생성 계열 명령을 허용합니다." },
      { key: "recruitJoinCommandEnabled", label: "구인 참가", desc: "번호+ㅉ 등 참가 계열 명령을 허용합니다." },
      { key: "recruitFinishCommandEnabled", label: "구인 마감", desc: "구인마감/진행 종료 계열 명령을 허용합니다." },
      { key: "recruitResetCommandEnabled", label: "구인 초기화", desc: "구인 번호/전체 초기화 계열 명령을 허용합니다." },
      { key: "recruitStatusCommandEnabled", label: "구인 현황", desc: "구인현황 출력 계열 명령을 허용합니다." },
    ],
  },
  {
    title: "전적/랭킹 명령",
    desc: "전적, 최근 경기, 랭킹 조회 기능을 각각 제어합니다.",
    columns: "grid4",
    fields: [
      { key: "playerRecordSearchEnabled", label: "전적 조회 전체", desc: "전적/최근/랭킹의 상위 스위치입니다." },
      { key: "recordCommandEnabled", label: "전적", desc: "전적 닉네임#태그 명령입니다." },
      { key: "recentCommandEnabled", label: "최근", desc: "최근 닉네임#태그 명령입니다." },
      { key: "rankingCommandEnabled", label: "랭킹", desc: "랭킹 조회 명령입니다." },
    ],
  },
  {
    title: "내전 참가신청",
    desc: "카카오톡 내전 명단 파싱과 현황 안내를 제어합니다.",
    columns: "grid3",
    fields: [
      { key: "seasonApplyCommandEnabled", label: "내전 참가신청 전체", desc: "내전 참가신청 관련 상위 스위치입니다." },
      { key: "seasonSnapshotForwardEnabled", label: "명단 자동 반영", desc: "전체 참가자 양식을 season-apply API로 전달합니다." },
      { key: "seasonStatusCommandEnabled", label: "내전현황 안내", desc: "내전현황/시즌내전현황 계열 응답을 제어합니다." },
    ],
  },
  {
    title: "운영신청 접수",
    desc: "카카오톡으로 들어오는 신청 유형별 접수 가능 여부를 제어합니다.",
    columns: "grid3",
    fields: [
      { key: "operationFormsEnabled", label: "운영신청 전체", desc: "외출/모임/건의/초대 접수 상위 스위치입니다." },
      { key: "friendApplicationEnabled", label: "지인 신청", desc: "지인 초대/신청 접수를 허용합니다." },
      { key: "leaveRequestEnabled", label: "외출 신청", desc: "외출/휴식 신청 접수를 허용합니다." },
      { key: "meetupRecordEnabled", label: "오프라인 모임", desc: "모임 신청/기록 접수를 허용합니다." },
      { key: "suggestionRequestEnabled", label: "건의사항", desc: "건의 접수를 허용합니다." },
      { key: "discordInviteRequestEnabled", label: "디스코드 초대", desc: "디스코드 초대 요청 접수를 허용합니다." },
    ],
  },
  {
    title: "도움말/기타 응답",
    desc: "알 수 없는 명령, 도움말, 구 AI공지 호환 응답을 제어합니다.",
    columns: "grid3",
    fields: [
      { key: "helpCommandEnabled", label: "도움말", desc: "도움말 명령 응답을 허용합니다." },
      { key: "unknownCommandResponseEnabled", label: "무응답 안내", desc: "알 수 없는 명령에 안내 메시지를 반환합니다." },
      { key: "aiNoticeRedirectEnabled", label: "AI공지 호환", desc: "AI공지 입력 시 내전현황 변경 안내를 반환합니다." },
      { key: "logRawMessageEnabled", label: "원문 로그 허용", desc: "추후 카카오 원문 로그 저장 기능에서 사용할 스위치입니다." },
    ],
  },
];

const numberFields: Array<{ key: NumberSettingKey; label: string; min: number; max: number; desc: string }> = [
  { key: "commandCooldownSeconds", label: "명령 쿨다운 초", min: 0, max: 300, desc: "명령 간 최소 간격 기준값입니다. 0이면 사용하지 않습니다." },
  { key: "openchatRateLimitPerMinute", label: "API 허용 횟수", min: 1, max: 300, desc: "카카오톡 openchat API rate limit의 허용 횟수입니다." },
  { key: "openchatRateLimitWindowSeconds", label: "API 제한 구간 초", min: 10, max: 3600, desc: "rate limit 적용 시간 구간입니다." },
  { key: "recruitStatusMaxVisible", label: "구인현황 표시 최대 수", min: 1, max: 50, desc: "구인현황 상세 출력 기준값으로 사용합니다." },
  { key: "rankingLimit", label: "랭킹 표시 수", min: 1, max: 20, desc: "카카오톡 랭킹 응답에 표시할 최대 인원 수입니다." },
  { key: "recentGamesLimit", label: "최근 경기 표시 수", min: 1, max: 20, desc: "최근 경기 응답에 표시할 최대 경기 수입니다." },
  { key: "maxMessageLength", label: "최대 메시지 길이", min: 100, max: 10000, desc: "이 길이를 넘는 카카오톡 메시지는 처리하지 않습니다." },
];

const textFields: Array<{ key: NullableStringSettingKey | StringSettingKey; label: string; rows?: number; desc: string; placeholder?: string }> = [
  { key: "responsePrefix", label: "공통 응답 접두어", desc: "비워두면 사용하지 않습니다. 예: [K-LOL.GG]", placeholder: "[K-LOL.GG]" },
  { key: "maintenanceMessage", label: "점검 메시지", rows: 4, desc: "전체 중지 또는 점검 모드일 때 반환합니다." },
  { key: "disabledFeatureMessage", label: "기능 중지 메시지", rows: 3, desc: "비활성화된 기능 호출 시 반환합니다." },
  { key: "blockedRoomMessage", label: "방 제한 메시지", rows: 3, desc: "허용되지 않은 방 또는 차단된 방에서 반환합니다." },
  { key: "unknownCommandMessage", label: "알 수 없는 명령 메시지", rows: 4, desc: "비워두면 기존 기본 도움말을 사용합니다." },
  { key: "notFoundMessage", label: "검색 실패 메시지", rows: 3, desc: "전적 검색 결과가 없을 때 반환합니다." },
  { key: "errorMessage", label: "오류 메시지", rows: 3, desc: "서버 처리 오류 시 반환합니다." },
  { key: "helperLinkTitle", label: "구인도우미 제목", desc: "구인도우미 링크 응답의 첫 줄 제목입니다." },
  { key: "recruitHelperPath", label: "구인도우미 경로", desc: "기본값: /recruit-helper" },
  { key: "recruitPagePath", label: "구인현황 경로", desc: "기본값: /recruit" },
  { key: "defaultRoomName", label: "기본 방 이름", desc: "roomName이 없을 때 참고용으로 사용합니다." },
  { key: "adminMemo", label: "운영 메모", rows: 5, desc: "관리자만 보는 내부 메모입니다." },
];

const arrayFields: Array<{ key: ArraySettingKey; label: string; desc: string; placeholder: string }> = [
  { key: "allowedRoomNames", label: "허용 방 이름", desc: "입력하면 여기에 포함된 방에서만 동작합니다. 한 줄에 하나씩 입력합니다.", placeholder: "K-LOL 구인구직\nLOL-K" },
  { key: "blockedRoomNames", label: "차단 방 이름", desc: "이름이 포함되면 응답하지 않습니다. 한 줄에 하나씩 입력합니다.", placeholder: "테스트방\n구버전방" },
  { key: "blockedSenders", label: "차단 발신자", desc: "해당 닉네임/표현이 포함된 발신자는 처리하지 않습니다.", placeholder: "스팸계정\n테스트봇" },
  { key: "botSenderPatterns", label: "봇 발신자 패턴", desc: "봇 발신 무시 판단에 쓰는 문자열입니다.", placeholder: "K-LOL\n구인도우미\n오픈채팅봇" },
];

function arrayToText(value: string[]) {
  return value.join("\n");
}

function textToArray(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export default function KakaoOperationSettingsClient({ initialSettings }: Props) {
  const [settings, setSettings] = useState<KakaoOperationSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledCount = useMemo(() => {
    return Object.values(settings).filter((value) => value === true).length;
  }, [settings]);

  function update<K extends keyof KakaoOperationSettings>(key: K, value: KakaoOperationSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function resetDefaults() {
    setSettings(CLIENT_DEFAULT_SETTINGS);
    setMessage("기본값으로 되돌렸습니다. 저장 버튼을 눌러야 DB에 반영됩니다.");
    setError(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/kakao/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; settings?: KakaoOperationSettings };
      if (!response.ok || !data.ok || !data.settings) {
        throw new Error(data.message || "카카오톡 설정 저장에 실패했습니다.");
      }
      setSettings(data.settings);
      setMessage("카카오톡 세부 운영 설정을 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "카카오톡 설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>KAKAO DYNAMIC SETTINGS</p>
            <h2 className={styles.title}>카카오톡 세부 설정</h2>
            <p className={styles.desc}>명령어 사용 여부, 방/발신자 제한, 응답 문구, 출력 제한, rate limit을 DB에서 동적으로 관리합니다.</p>
          </div>
          <div className={styles.saveBar}>
            <button type="button" className={styles.secondaryButton} onClick={resetDefaults} disabled={saving}>기본값 복원</button>
            <button type="button" className={styles.primaryButton} onClick={save} disabled={saving}>{saving ? "저장 중..." : "설정 저장"}</button>
          </div>
        </div>

        <div className={styles.statusGrid}>
          <div className={styles.statusCard}><span className={styles.statusLabel}>전체 상태</span><strong className={styles.statusValue}>{settings.globalEnabled && !settings.maintenanceMode ? "운영" : "중지/점검"}</strong></div>
          <div className={styles.statusCard}><span className={styles.statusLabel}>활성 스위치</span><strong className={styles.statusValue}>{enabledCount}개</strong></div>
          <div className={styles.statusCard}><span className={styles.statusLabel}>API 제한</span><strong className={styles.statusValue}>{settings.openchatRateLimitPerMinute}/{settings.openchatRateLimitWindowSeconds}s</strong></div>
          <div className={styles.statusCard}><span className={styles.statusLabel}>방 제한</span><strong className={styles.statusValue}>{((settings.allowedRoomNames ?? []).length || (settings.blockedRoomNames ?? []).length) ? "사용" : "미사용"}</strong></div>
        </div>
      </section>

      {message ? <div className={styles.notice}>{message}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <p className={styles.sectionDesc}>{section.desc}</p>
            </div>
          </div>
          <div className={styles[section.columns ?? "grid3"]}>
            {section.fields.map((field) => {
              const checked = Boolean(settings[field.key]);
              return (
                <label key={String(field.key)} className={styles.toggleCard}>
                  <input className={styles.hiddenInput} type="checkbox" checked={checked} onChange={(event) => update(field.key, event.target.checked)} />
                  <span className={styles.toggleText}><strong>{field.label}</strong><span>{field.desc}</span></span>
                  <span className={`${styles.switch} ${checked ? styles.switchOn : ""}`}><span className={styles.knob} /></span>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h3 className={styles.sectionTitle}>제한값/출력 개수</h3>
            <p className={styles.sectionDesc}>카카오톡 API 사용량과 응답 출력량을 숫자로 제어합니다.</p>
          </div>
        </div>
        <div className={styles.grid3}>
          {numberFields.map((field) => (
            <label key={String(field.key)} className={styles.field}>
              <span>{field.label}</span>
              <input className={styles.input} type="number" min={field.min} max={field.max} value={settings[field.key]} onChange={(event) => update(field.key, Number(event.target.value))} />
              <small>{field.desc}</small>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h3 className={styles.sectionTitle}>방/발신자 제한</h3>
            <p className={styles.sectionDesc}>허용 방, 차단 방, 차단 발신자, 봇 발신자 패턴을 한 줄 단위로 관리합니다.</p>
          </div>
        </div>
        <div className={styles.grid2}>
          {arrayFields.map((field) => (
            <label key={String(field.key)} className={styles.field}>
              <span>{field.label}</span>
              <textarea className={styles.textarea} rows={5} value={arrayToText(settings[field.key])} onChange={(event) => update(field.key, textToArray(event.target.value))} placeholder={field.placeholder} />
              <small>{field.desc}</small>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h3 className={styles.sectionTitle}>응답 문구/경로</h3>
            <p className={styles.sectionDesc}>카카오톡에 반환되는 안내 문구와 웹 경로를 직접 관리합니다.</p>
          </div>
        </div>
        <div className={styles.grid2}>
          {textFields.map((field) => (
            <label key={String(field.key)} className={`${styles.field} ${field.rows ? styles.fullWidth : ""}`}>
              <span>{field.label}</span>
              {field.rows ? (
                <textarea className={styles.textarea} rows={field.rows} value={String(settings[field.key] ?? "")} onChange={(event) => update(field.key as keyof KakaoOperationSettings, event.target.value as never)} placeholder={field.placeholder} />
              ) : (
                <input className={styles.input} type="text" value={String(settings[field.key] ?? "")} onChange={(event) => update(field.key as keyof KakaoOperationSettings, event.target.value as never)} placeholder={field.placeholder} />
              )}
              <small>{field.desc}</small>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}


