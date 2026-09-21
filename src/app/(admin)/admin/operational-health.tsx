import Link from "next/link";
import { Activity, CalendarCheck, Database, Gamepad2, MessageCircleMore } from "lucide-react";
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
        <div><span>운영 진단</span><h2 id="admin-health-title">자동 작업과 연동 상태</h2></div>
        <p>조회 시각 {time(snapshot.checkedAt)}</p>
      </div>
      <p className={styles.healthNote}>화면을 열 때 기록을 조회합니다. 새로고침하면 다시 확인하며, 외부로 장애 알림을 보내지 않습니다.</p>
      <div className={styles.grid}>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><Activity aria-hidden="true" /></span>{state(statuses.statistics)}</div>
          <h3>경기 통계 반영</h3>
          <p>대기·처리 중 {statistics.pending}건 · 실패 {statistics.failed}건</p>
          <p>가장 오래된 대기: {time(statistics.oldestPendingAt)}</p>
          <p>최근 이벤트 소비: {time(statistics.lastConsumedAt)}</p>
          <p>대기 15분 이상 또는 실패가 있으면 점검이 필요합니다. 5분 주기 예약 작업은 빈 대기열 호출 기록이 없어 최근 호출 여부가 미확인입니다.</p>
          <Link className={styles.pending} href="/admin/balance">시즌별 반영 상태</Link>
        </article>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><CalendarCheck aria-hidden="true" /></span>{state(statuses.dailyClose)}</div>
          <h3>카카오 일일 마감</h3>
          <p>최근 작업: {dailyClose ? ({ RUNNING: "진행 중", SUCCEEDED: "성공", FAILED: "실패" } as const)[dailyClose.status] : "기록 없음"}</p>
          <p>시작: {time(dailyClose?.startedAt ?? null)}</p>
          <p>완료: {time(dailyClose?.completedAt ?? null)}</p>
          <p>매일 오전 6시(KST) 실행 대상입니다. 15분의 여유 이후 해당 운영일 성공 기록이 없으면 점검이 필요합니다. 수동 실행 기록도 포함합니다.</p>
        </article>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><Database aria-hidden="true" /></span>{state(statuses.storage)}</div>
          <h3>비공개 이미지 저장소</h3>
          <p>최근 왕복 검사: {storage ? ({ RUNNING: "진행 중", SUCCEEDED: "성공", FAILED: "실패" } as const)[storage.status] : "기록 없음"}</p>
          <p>완료: {time(storage?.completedAt ?? null)}</p>
          <p>검사 대상: {storage ? storage.realStorage ? "실제 Vercel Blob" : "합성 저장소 / 제공자 미확인" : "미확인"}</p>
          <p>업로드·읽기·삭제를 확인한 수동 검사 기록입니다. 과거 성공만으로 현재 연결 상태를 보장하지 않습니다.</p>
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
          <p>30분 이상 대기하면 점검이 필요합니다. 설정 준비는 API 키의 실제 권한이나 Riot의 본인 인증 승인 확인과 별개입니다.</p>
          <p>API 키 진단은 해당 시각의 서버 상태 조회 수락 기록입니다. 현재 연결, 전적 API 권한이나 본인 인증 승인은 별도 확인이 필요합니다.</p>
        </article>
        <article className={styles.areaCard}>
          <div className={styles.healthCardHeading}><span className={styles.icon}><MessageCircleMore aria-hidden="true" /></span>{state(statuses.siteNotices)}</div>
          <h3>사이트 충원 카카오 알림</h3>
          <p>서버 기능 {siteNotices.enabled ? "켜짐" : "꺼짐"} · 대상·서명 설정 {siteNotices.configured ? "준비됨" : "미확인 / 미비"}</p>
          <p>현재 대상 대기·전송 중 {siteNotices.pending}건 · 보관 중 실패 {siteNotices.failed}건 · 만료 정리 대기 {siteNotices.expiredPending}건</p>
          <p>최근 인증 요청: {time(siteNotices.lastAuthenticatedAt)}</p>
          <p>최근 전송 확인 응답: {time(siteNotices.lastAcknowledgedAt)}</p>
          <p>5분 이상 대기 또는 실패가 있으면 점검이 필요합니다. 최근 인증 요청에는 운영 점검도 포함되며, 기록이 정리되면 표시되지 않습니다. 실제 휴대폰 수신은 미확인입니다.</p>
        </article>
      </div>
    </section>
  );
}
