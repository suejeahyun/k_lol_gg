import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, CloudSun, LogIn, ShieldCheck, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";

import { ApplicationActions } from "./application-actions";
import styles from "./applications.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "참가 신청",
  description: "활성 시즌의 오늘 참가 신청을 확인하고 내 신청을 안전하게 수정하거나 취소합니다.",
  alternates: { canonical: "/applications" },
};

function statusLabel(status: string) {
  return {
    APPLIED: "신청",
    RESERVE: "예비",
    CONFIRMED: "확정",
    REJECTED: "거절",
    CANCELLED: "취소",
  }[status] ?? status;
}

export default async function ApplicationsPage() {
  const session = await getCurrentSession();
  const result = await loadRuntimeSeasonData((service) =>
    service.getApplicationHub(session?.userId ?? null),
  );

  return (
    <main className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="applications-title">
        <div>
          <Badge variant="secondary"><CloudSun size={13} aria-hidden="true" /> S03 · SEASON DAY</Badge>
          <p>APPLICATIONS</p>
          <h1 id="applications-title">오늘 같이 뛰어요</h1>
          <span>활성 시즌과 신청 상태를 한눈에 확인하고, 내 라인을 가볍게 골라 참가할 수 있어요.</span>
        </div>
        <CalendarDays aria-hidden="true" />
      </section>

      {result.state === "unavailable" ? (
        <section className={styles.stateCard} role="status">
          <CloudSun aria-hidden="true" />
          <h2>시즌 데이터 연결을 준비하고 있어요.</h2>
          <p>V2 전용 PostgreSQL이 연결되기 전에는 샘플 신청을 만들어 보여주지 않습니다.</p>
        </section>
      ) : result.state === "error" ? (
        <section className={`${styles.stateCard} ${styles.error}`} role="alert">
          <ShieldCheck aria-hidden="true" />
          <h2>시즌 정보를 불러오지 못했어요.</h2>
          <p>잠시 후 새로고침해 주세요. 내부 오류나 계정 정보는 화면에 노출하지 않습니다.</p>
        </section>
      ) : !result.data.currentSeason ? (
        <section className={styles.stateCard}>
          <CalendarDays aria-hidden="true" />
          <h2>현재 활성 시즌이 없어요.</h2>
          <p>새 시즌이 열리면 이곳에서 신청 기간과 오늘 참가 현황을 바로 확인할 수 있어요.</p>
        </section>
      ) : (
        <>
          <section className={styles.overview} aria-labelledby="season-overview-title">
            <div className={styles.sectionHeading}>
              <div>
                <span>ACTIVE SEASON</span>
                <h2 id="season-overview-title">{result.data.currentSeason.name}</h2>
              </div>
              <strong data-open={result.data.currentSeason.applicationsOpen}>
                {result.data.currentSeason.applicationsOpen ? "신청 가능" : "신청 마감"}
              </strong>
            </div>
            <div className={styles.stats}>
              <article><span>신청</span><strong>{result.data.counts.applied}</strong></article>
              <article><span>예비</span><strong>{result.data.counts.reserve}</strong></article>
              <article><span>확정</span><strong>{result.data.counts.confirmed}</strong></article>
            </div>
          </section>

          {result.data.viewer === "RESTRICTED" ? (
            <section className={styles.stateCard} role="status">
              <ShieldCheck aria-hidden="true" />
              <h2>현재 계정은 참가 신청이 제한되어 있어요.</h2>
              <p>계정 검토가 끝난 뒤 다시 확인해 주세요. 제한 사유나 내부 상태는 공개 화면에 표시하지 않습니다.</p>
            </section>
          ) : result.data.viewer === "ANONYMOUS" ? (
            <section className={styles.loginCard}>
              <LogIn aria-hidden="true" />
              <div>
                <h2>현황은 누구나, 신청은 승인된 계정으로</h2>
                <p>로그인하면 연결된 플레이어의 오늘 신청만 만들고 수정하거나 취소할 수 있습니다.</p>
              </div>
              <Link href="/login?next=%2Fapplications">로그인</Link>
            </section>
          ) : !result.data.hasActivePlayer && result.data.currentSeason.applicationsOpen ? (
            <section className={styles.stateCard} role="status">
              <UsersRound aria-hidden="true" />
              <h2>연결된 활성 플레이어가 필요해요.</h2>
              <p>내 플레이어 연결을 확인한 뒤 다시 신청해 주세요.</p>
            </section>
          ) : result.data.canApply ? (
            <ApplicationActions initial={result.data.myApplication} />
          ) : result.data.currentSeason.applicationsOpen && result.data.myApplication ? (
            <ApplicationActions initial={result.data.myApplication} />
          ) : (
            <section className={styles.stateCard}>
              <ShieldCheck aria-hidden="true" />
              <h2>신청 기간이 마감되었어요.</h2>
              <p>이미 접수된 내 신청과 공개 참가 현황은 아래에서 확인할 수 있습니다.</p>
            </section>
          )}

          {result.data.viewer === "APPROVED" && result.data.myApplication ? (
            <section className={styles.myStatus} aria-labelledby="my-status-title">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <span>MY STATUS</span>
                <h2 id="my-status-title">{statusLabel(result.data.myApplication.status)}</h2>
                <p>{result.data.myApplication.applyDate} · #{result.data.myApplication.recruitNo} · {result.data.myApplication.mainPosition}</p>
              </div>
            </section>
          ) : null}

          <section className={styles.participants} aria-labelledby="participants-title">
            <div className={styles.sectionHeading}>
              <div><span>PUBLIC ROSTER</span><h2 id="participants-title">참가 현황</h2></div>
              <strong>{result.data.participantTotal}명</strong>
            </div>
            {result.data.participants.length === 0 ? (
              <div className={styles.participantEmpty}>
                <UsersRound aria-hidden="true" />
                <p>아직 공개할 참가 신청이 없어요. 첫 신청을 기다리고 있어요.</p>
              </div>
            ) : (
              <ul className={styles.participantList}>
                {result.data.participants.map((participant) => (
                  <li key={`${participant.player.id}-${participant.applyDate}-${participant.recruitNo}`}>
                    <span aria-hidden="true">{participant.player.displayName.slice(0, 1).toUpperCase()}</span>
                    <div><strong>{participant.player.displayName}</strong><small>{participant.player.riotId}</small></div>
                    <em>{participant.mainPosition}</em>
                    <b data-status={participant.status}>{statusLabel(participant.status)}</b>
                  </li>
                ))}
              </ul>
            )}
            {result.data.participantsTruncated ? <small className={styles.privacy}>전체 {result.data.participantTotal}명 중 접수 순서 기준 200명만 표시합니다.</small> : null}
            <small className={styles.privacy}>공개 응답에는 닉네임·Riot ID·선택 라인만 포함하며 회원명, 로그인 ID, Discord, 관리자 메모는 포함하지 않습니다.</small>
          </section>
        </>
      )}
    </main>
  );
}
