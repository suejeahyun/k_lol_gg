import Link from "next/link";
import { Activity, CalendarCheck, Database, Gamepad2, MessageCircleMore } from "@/components/theme/theme-icons";
import { Badge } from "@/components/ui/badge";
import { operationalHealthStatuses, type OperationalHealthSnapshot, type OperationalStatus } from "@/modules/operations/application/operational-health";
import styles from "./page.module.css";

const labels: Record<OperationalStatus, string> = {
  CLEAR: "기록 확인", ATTENTION: "점검 필요", UNVERIFIED: "확인 필요", DISABLED: "비활성",
};
const kst = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" });
function time(value: string | null) {
  return value ? <time dateTime={value}>{kst.format(new Date(value))} KST</time> : "기록 없음";
}
function state(status: OperationalStatus) {
  return <Badge variant={status === "ATTENTION" ? "destructive" : status === "CLEAR" ? "secondary" : "outline"}>{labels[status]}</Badge>;
}

export function OperationalHealth({ snapshot }: Readonly<{ snapshot: OperationalHealthSnapshot }>) {
  const statuses = operationalHealthStatuses(snapshot);
  const { statistics, dailyClose, storage, riot, siteNotices } = snapshot;
  return (
    <section className={styles.health} aria-labelledby="admin-health-title">
      <div className={styles.sectionHeading}>
        <div><h2 id="admin-health-title">자동 작업과 연동 상태</h2></div>
        <p>조회 시각 {time(snapshot.checkedAt)}</p>
      </div>
      <p className={styles.healthNote}>화면 조회 시점의 기록 · 새로고침으로 갱신 · 외부 장애 알림 없음</p>
      <div className={styles.grid}>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><Activity aria-hidden="true" /></span>{state(statuses.statistics)}</div>
          <h3>경기 통계 반영</h3>
          <p>대기·처리 중 {statistics.pending}건 · 실패 {statistics.failed}건</p>
          <p>가장 오래된 대기: {time(statistics.oldestPendingAt)}</p>
          <p>최근 이벤트 소비: {time(statistics.lastConsumedAt)}</p>
          <p>점검 기준: 대기 15분 이상·실패 발생 · 5분 주기 작업의 빈 대기열 호출은 기록 없어 미확인</p>
          <Link className={styles.pending} href="/admin/balance">시즌별 반영 상태</Link>
        </article>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><CalendarCheck aria-hidden="true" /></span>{state(statuses.dailyClose)}</div>
          <h3>카카오 일일 마감</h3>
          <p>최근 작업: {dailyClose ? ({ RUNNING: "진행 중", SUCCEEDED: "성공", FAILED: "실패" } as const)[dailyClose.status] : "기록 없음"}</p>
          <p>시작: {time(dailyClose?.startedAt ?? null)}</p>
          <p>완료: {time(dailyClose?.completedAt ?? null)}</p>
          <p>매일 06:00 KST · 06:15 이후 당일 성공 없으면 점검 · 수동 실행 포함</p>
        </article>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><Database aria-hidden="true" /></span>{state(statuses.storage)}</div>
          <h3>비공개 이미지 저장소</h3>
          <p>최근 왕복 검사: {storage ? ({ RUNNING: "진행 중", SUCCEEDED: "성공", FAILED: "실패" } as const)[storage.status] : "기록 없음"}</p>
          <p>완료: {time(storage?.completedAt ?? null)}</p>
          <p>검사 대상: {storage ? storage.realStorage ? "실제 Vercel Blob" : "합성 저장소 / 제공자 미확인" : "미확인"}</p>
          <p>수동 업로드·읽기·삭제 검사 · 현재 연결 상태와 별개</p>
        </article>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><Gamepad2 aria-hidden="true" /></span>{state(statuses.riot)}</div>
          <h3>Riot 연동</h3>
          <p>서버 기능 {riot.integrationEnabled ? "켜짐" : "꺼짐"} · 사이트 기능 {riot.siteEnabled === null ? "미확인" : riot.siteEnabled ? "켜짐" : "꺼짐"}</p>
          <p>API·암호화 설정 {riot.apiConfigured ? "준비됨" : "미비"} · 본인 인증 설정 {riot.rsoConfigured ? "준비됨" : "미비"}{riot.synthetic ? " · 합성 모드" : ""}</p>
          <p>대기·처리 중 {riot.pending}건 · 최근 24시간 실패·부분 완료 {riot.failed}건</p>
          <p>가장 오래된 대기: {time(riot.oldestPendingAt)}</p>
          <p>최근 완료(부분 포함): {time(riot.lastCompletedAt)}</p>
          <p>실제 API 키 진단: {riot.apiProbe ? ({ RUNNING: "진행 중", SUCCEEDED: "수락 확인", FAILED: "실패" } as const)[riot.apiProbe.status] : "실제 API 수락 미확인"} · {time(riot.apiProbe?.completedAt ?? null)}</p>
          <p>점검 기준: 대기 30분 이상 · 설정 준비와 실제 API 권한·본인 인증 승인은 별개</p>
          <p>키 진단 범위: 검사 시각의 서버 상태 조회 · 현재 연결·전적 API·본인 인증 승인 미확인</p>
        </article>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><MessageCircleMore aria-hidden="true" /></span>{state(statuses.siteNotices)}</div>
          <h3>사이트 충원 카카오 알림</h3>
          <p>서버 기능 {siteNotices.enabled ? "켜짐" : "꺼짐"} · 대상·서명 설정 {siteNotices.configured ? "준비됨" : "미확인 / 미비"}</p>
          <p>현재 대상 대기·전송 중 {siteNotices.pending}건 · 보관 중 실패 {siteNotices.failed}건 · 만료 정리 대기 {siteNotices.expiredPending}건</p>
          <p>최근 인증 요청: {time(siteNotices.lastAuthenticatedAt)}</p>
          <p>최근 전송 확인 응답: {time(siteNotices.lastAcknowledgedAt)}</p>
          <p>점검 기준: 대기 5분 이상·실패 발생 · 인증 요청은 운영 점검 포함 · 정리된 기록 제외 · 실제 휴대폰 수신 미확인</p>
        </article>
      </div>
    </section>
  );
}
