import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { CalendarDays, CheckCircle2, CloudSun, LogIn, ShieldCheck, UsersRound } from "@/components/theme/theme-icons";

import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { parseCanonicalViewQuery } from "@/modules/navigation/application/canonical-view-query";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";
import { APPLICATION_POSITION_LABELS } from "@/modules/seasons/application/client-application-positions";

import { RecruitingCompetitions } from "@/components/navigation/recruiting-competitions";
import { ApplicationActions } from "./application-actions";
import styles from "./applications.module.css";

export const dynamic = "force-dynamic";

export const metadata = createRouteMetadata("/applications");

function statusLabel(status: string) {
  return {
    APPLIED: "신청",
    RESERVE: "예비",
    CONFIRMED: "확정",
    REJECTED: "거절",
    CANCELLED: "취소",
  }[status] ?? status;
}

const recruitNoValues = Array.from({ length: 999 }, (_, index) => String(index + 1));

function ApplicationRecovery({ recruitNo, source }: { recruitNo: number; source?: string }) {
  return <div className="recovery-links"><form action="/applications" method="get">
    <input type="hidden" name="type" value="season" />
    <input type="hidden" name="recruitNo" value={recruitNo} />
    {source ? <input type="hidden" name="source" value={source} /> : null}
    <Button type="submit" size="lg">다시 불러오기</Button>
  </form><Link href="/applications">현재 모집 보기</Link></div>;
}

function ApplicationsHero({ type, source }: { type: string; source?: string }) {
  return <><section className={styles.hero} aria-labelledby="applications-title">
    <div>
      {source === "kakao" ? <p>카카오에서 이어서 신청</p> : null}
      <h1 id="applications-title">참가 신청</h1>
    </div>
    <CalendarDays aria-hidden="true" />
  </section><nav className={styles.typeTabs} aria-label="참가 신청 종류"><Link href="/applications?type=season" aria-current={type === "season" ? "page" : undefined}>오늘 내전</Link><Link href="/applications?type=event" aria-current={type === "event" ? "page" : undefined}>이벤트전</Link><Link href="/applications?type=destruction" aria-current={type === "destruction" ? "page" : undefined}>멸망전</Link><Link href="/recruits">파티 모집</Link></nav></>;
}

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const selection = parseCanonicalViewQuery(await searchParams, {
    type: ["season", "event", "destruction"],
    source: ["pwa", "bookmark", "kakao"],
    recruitNo: recruitNoValues,
  });
  if (!selection.ok) return <div className={`page-wrap ${styles.page}`} data-application-type="invalid"><ApplicationsHero type="invalid" /><section className={`${styles.stateCard} ${styles.error}`} role="alert"><ShieldCheck aria-hidden="true" /><h2>신청 화면 주소를 확인해 주세요.</h2><Link href="/applications">신청 화면 다시 열기</Link></section></div>;
  const type = selection.values.type ?? "season";
  const source = selection.values.source;
  const selectedRecruitNo = Number(selection.values.recruitNo ?? "1");
  if (type !== "season") {
    return <div className={`page-wrap ${styles.page}`} data-application-type={type} data-entry-source={source}><ApplicationsHero type={type} source={source} /><RecruitingCompetitions type={type === "event" ? "event" : "destruction"} /></div>;
  }
  const session = await getCurrentSession("ACCOUNT");
  const result = await loadRuntimeSeasonData((service) =>
    service.getApplicationHub(session?.userId ?? null, selectedRecruitNo),
  );

  return (
    <div className={`page-wrap ${styles.page}`} data-application-type="season" data-entry-source={source}>
      <ApplicationsHero type="season" source={source} />

      {result.state === "unavailable" ? (
        <section className={styles.stateCard} role="status">
          <CloudSun aria-hidden="true" />
          <h2>시즌 현황을 불러올 수 없어요.</h2>
          <ApplicationRecovery recruitNo={selectedRecruitNo} source={source} />
        </section>
      ) : result.state === "error" ? (
        <section className={`${styles.stateCard} ${styles.error}`} role="alert">
          <ShieldCheck aria-hidden="true" />
          <h2>시즌 정보를 불러오지 못했어요.</h2>
          <ApplicationRecovery recruitNo={selectedRecruitNo} source={source} />
        </section>
      ) : !result.data.currentSeason ? (
        <section className={styles.stateCard}>
          <CalendarDays aria-hidden="true" />
          <h2>현재 활성 시즌이 없어요.</h2>
          <Link href="/recruits">열린 파티 모집 보기</Link>
        </section>
      ) : (
        <>
          <section className={styles.overview} aria-labelledby="season-overview-title">
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="season-overview-title">{result.data.currentSeason.name}</h2>
              </div>
              <strong data-open={result.data.currentSeason.applicationsOpen && !result.data.round.closed}>
                {result.data.currentSeason.applicationsOpen && !result.data.round.closed ? "모집 중" : "모집 마감"}
              </strong>
            </div>
            {result.data.availableRecruitNos.length > 1 ? <nav className={styles.roundTabs} aria-label="오늘 모집 회차">{result.data.availableRecruitNos.map((recruitNo) => {
              const query = new URLSearchParams({ type: "season", recruitNo: String(recruitNo) });
              if (source) query.set("source", source);
              return <Link key={recruitNo} href={`/applications?${query.toString()}`} aria-current={recruitNo === result.data.selectedRecruitNo ? "page" : undefined}>{recruitNo}회차</Link>;
            })}</nav> : null}
            <div className={styles.stats}>
              <article><span>본 참가</span><strong>{result.data.counts.applied + result.data.counts.confirmed}/{result.data.round.capacity}</strong></article>
              <article><span>예비</span><strong>{result.data.counts.reserve}</strong></article>
              <article><span>확정</span><strong>{result.data.counts.confirmed}</strong></article>
            </div>
            {result.data.unlinkedCount > 0 ? <p className={styles.mergeNotice}>참가 인원 중 회원 연결 대기 {result.data.unlinkedCount}명</p> : null}
          </section>

          {!result.data.currentSeason.applicationsOpen || result.data.round.closed ? (
            <section className={styles.stateCard}>
              <ShieldCheck aria-hidden="true" />
              <h2>신청 기간이 마감되었어요.</h2>
              <Link href="/recruits">다른 모집 보기</Link>
            </section>
          ) : result.data.viewer === "RESTRICTED" ? (
            <section className={styles.stateCard} role="status">
              <ShieldCheck aria-hidden="true" />
              <h2>현재 계정은 참가 신청이 제한되어 있어요.</h2>
              <nav className="recovery-links"><Link href="/account">내 계정 상태 확인</Link><Link href="/help/contact">운영팀에 문의</Link></nav>
            </section>
          ) : result.data.viewer === "ANONYMOUS" ? (
            <section className={styles.loginCard}>
              <LogIn aria-hidden="true" />
              <div>
                <h2>참가 신청은 로그인·승인 필요</h2>
              </div>
              <Link href={`/login?next=${encodeURIComponent(`/applications?type=season&recruitNo=${selectedRecruitNo}`)}`}>로그인</Link>
            </section>
          ) : !result.data.hasActivePlayer && result.data.currentSeason.applicationsOpen ? (
            <section className={styles.stateCard} role="status">
              <UsersRound aria-hidden="true" />
              <h2>연결된 활성 플레이어가 필요해요.</h2>
              <Link href="/account">내 계정에서 연결 확인</Link>
            </section>
          ) : result.data.canApply ? (
            <ApplicationActions
              key={`${result.data.currentSeason.id}:${result.data.applyDate}:${result.data.selectedRecruitNo}`}
              initial={result.data.myApplication}
              recruitNo={result.data.selectedRecruitNo}
              applicantPlayer={result.data.applicantPlayer!}
              applyDate={result.data.applyDate}
              mode={result.data.round.mode}
              closed={result.data.round.closed}
              capacity={result.data.round.capacity}
              participantCount={result.data.counts.applied + result.data.counts.confirmed}
            />
          ) : result.data.currentSeason.applicationsOpen && result.data.myApplication ? (
            <ApplicationActions
              key={`${result.data.currentSeason.id}:${result.data.applyDate}:${result.data.selectedRecruitNo}`}
              initial={result.data.myApplication}
              recruitNo={result.data.selectedRecruitNo}
              applicantPlayer={result.data.applicantPlayer!}
              applyDate={result.data.applyDate}
              mode={result.data.round.mode}
              closed={result.data.round.closed}
              capacity={result.data.round.capacity}
              participantCount={result.data.counts.applied + result.data.counts.confirmed}
            />
          ) : (
            <section className={styles.stateCard}>
              <ShieldCheck aria-hidden="true" />
              <h2>신청 기간이 마감되었어요.</h2>
              <Link href="/recruits">다른 모집 보기</Link>
            </section>
          )}

          {result.data.viewer === "APPROVED" && result.data.myApplication ? (
            <section className={styles.myStatus} aria-labelledby="my-status-title">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <h2 id="my-status-title">{statusLabel(result.data.myApplication.status)}</h2>
                <p>
                  {result.data.myApplication.applyDate} · {result.data.myApplication.recruitNo}회차
                  {result.data.round.mode === "RIFT"
                    ? ` · 주 ${APPLICATION_POSITION_LABELS[result.data.myApplication.mainPosition]} · 부 ${result.data.myApplication.subPositions.map((position) => APPLICATION_POSITION_LABELS[position]).join(", ") || "없음"}`
                    : " · 포지션 구분 없음"}
                  {` · ${result.data.myApplication.source === "SITE" ? "사이트" : "카카오 연동"}`}
                </p>
              </div>
            </section>
          ) : null}

          <section className={styles.participants} aria-labelledby="participants-title">
            <div className={styles.sectionHeading}>
              <div><h2 id="participants-title">참가 현황</h2></div>
              <strong>{result.data.participantTotal}명</strong>
            </div>
            {result.data.participants.length === 0 ? (
              <div className={styles.participantEmpty}>
                <UsersRound aria-hidden="true" />
                <p>아직 공개할 참가 신청이 없어요.</p>
              </div>
            ) : (
              <ul className={styles.participantList}>
                {result.data.participants.map((participant) => (
                  <li key={`${participant.player.id}-${participant.applyDate}-${participant.recruitNo}`}>
                    <span aria-hidden="true">{participant.player.displayName.slice(0, 1).toUpperCase()}</span>
                    <div><strong>{participant.player.displayName}</strong><small>{participant.player.riotId}</small></div>
                    <em>{result.data.round.mode === "RIFT" ? `주 ${APPLICATION_POSITION_LABELS[participant.mainPosition]} · 부 ${participant.subPositions.map((position) => APPLICATION_POSITION_LABELS[position]).join(", ") || "없음"}` : "포지션 구분 없음"}</em>
                    <b data-status={participant.status}>{statusLabel(participant.status)}</b>
                  </li>
                ))}
              </ul>
            )}
            {result.data.participantsTruncated ? <small className={styles.privacy}>전체 {result.data.participantTotal}명 · 접수순 200명 표시</small> : null}
            <small className={styles.privacy}>명단 공개 항목: 닉네임·Riot ID·선택 라인</small>
          </section>
        </>
      )}
    </div>
  );
}
