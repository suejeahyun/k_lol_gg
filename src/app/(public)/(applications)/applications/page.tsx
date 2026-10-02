import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { CalendarDays, CheckCircle2, CloudSun, LogIn, ShieldCheck, UsersRound } from "@/components/theme/theme-icons";

import { Badge } from "@/components/ui/badge";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { parseCanonicalViewQuery } from "@/modules/navigation/application/canonical-view-query";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";

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

function ApplicationsHero({ type, source }: { type: string; source?: string }) {
  return <><section className={styles.hero} aria-labelledby="applications-title">
    <div>
      <Badge variant="secondary"><CloudSun size={13} aria-hidden="true" /> TODAY · APPLICATIONS</Badge>
      <p>{source === "kakao" ? "카카오에서 이어서 신청" : "참가·모집"}</p>
      <h1 id="applications-title">오늘 같이 뛰어요</h1>
      <span>신청 종류를 고르고 현재 모집과 내 신청 상태를 한눈에 확인하세요.</span>
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
  if (!selection.ok) return <div className={`page-wrap ${styles.page}`} data-application-type="invalid"><ApplicationsHero type="invalid" /><section className={`${styles.stateCard} ${styles.error}`} role="alert"><ShieldCheck aria-hidden="true" /><h2>신청 화면 주소를 확인해 주세요.</h2><p>다시 신청 종류를 선택해 주세요.</p><Link href="/applications">신청 화면 다시 열기</Link></section></div>;
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
          <p>잠시 후 다시 확인해 주세요.</p>
        </section>
      ) : result.state === "error" ? (
        <section className={`${styles.stateCard} ${styles.error}`} role="alert">
          <ShieldCheck aria-hidden="true" />
          <h2>시즌 정보를 불러오지 못했어요.</h2>
          <p>잠시 후 새로고침해 주세요.</p>
        </section>
      ) : !result.data.currentSeason ? (
        <section className={styles.stateCard}>
          <CalendarDays aria-hidden="true" />
          <h2>현재 활성 시즌이 없어요.</h2>
          <p>새 시즌이 열리면 이곳에서 신청 기간과 오늘 참가 현황을 바로 확인할 수 있어요.</p><Link href="/recruits">지금 열린 파티 모집 보기</Link>
        </section>
      ) : (
        <>
          <section className={styles.overview} aria-labelledby="season-overview-title">
            <div className={styles.sectionHeading}>
              <div>
                <span>ACTIVE SEASON</span>
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
            {result.data.unlinkedCount > 0 ? <p className={styles.mergeNotice}>회원 연결 확인 중 {result.data.unlinkedCount}명도 참가 인원에 포함되어 있어요.</p> : null}
          </section>

          {result.data.viewer === "RESTRICTED" ? (
            <section className={styles.stateCard} role="status">
              <ShieldCheck aria-hidden="true" />
              <h2>현재 계정은 참가 신청이 제한되어 있어요.</h2>
              <p>계정 검토가 끝난 뒤 다시 확인해 주세요.</p><nav className="recovery-links"><Link href="/account">내 계정 상태 확인</Link><Link href="/help/contact">운영팀에 문의</Link></nav>
            </section>
          ) : result.data.viewer === "ANONYMOUS" ? (
            <section className={styles.loginCard}>
              <LogIn aria-hidden="true" />
              <div>
                <h2>현황은 누구나, 신청은 승인된 계정으로</h2>
                <p>로그인하면 연결된 플레이어의 오늘 신청만 만들고 수정하거나 취소할 수 있습니다.</p>
              </div>
              <Link href={`/login?next=${encodeURIComponent(`/applications?type=season&recruitNo=${selectedRecruitNo}`)}`}>로그인</Link>
            </section>
          ) : !result.data.hasActivePlayer && result.data.currentSeason.applicationsOpen ? (
            <section className={styles.stateCard} role="status">
              <UsersRound aria-hidden="true" />
              <h2>연결된 활성 플레이어가 필요해요.</h2>
              <p>내 플레이어 연결을 확인한 뒤 다시 신청해 주세요.</p><Link href="/account">내 계정에서 연결 확인</Link>
            </section>
          ) : result.data.canApply ? (
            <ApplicationActions
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
              <p>이미 접수된 내 신청과 공개 참가 현황은 아래에서 확인할 수 있습니다.</p><Link href="/recruits">다른 모집 보기</Link>
            </section>
          )}

          {result.data.viewer === "APPROVED" && result.data.myApplication ? (
            <section className={styles.myStatus} aria-labelledby="my-status-title">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <span>MY STATUS</span>
                <h2 id="my-status-title">{statusLabel(result.data.myApplication.status)}</h2>
                <p>
                  {result.data.myApplication.applyDate} · {result.data.myApplication.recruitNo}회차 · 주 {result.data.myApplication.mainPosition}
                  {result.data.myApplication.subPositions.length > 0 ? ` · 부 ${result.data.myApplication.subPositions.join(", ")}` : " · 부 없음"}
                  {` · ${result.data.myApplication.source === "SITE" ? "사이트" : "카카오 연동"}`}
                </p>
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
                    <em>주 {participant.mainPosition} · 부 {participant.subPositions.join(", ") || "없음"}</em>
                    <b data-status={participant.status}>{statusLabel(participant.status)}</b>
                  </li>
                ))}
              </ul>
            )}
            {result.data.participantsTruncated ? <small className={styles.privacy}>전체 {result.data.participantTotal}명 중 접수 순서 기준 200명만 표시합니다.</small> : null}
            <small className={styles.privacy}>참가 명단에는 닉네임·Riot ID·선택 라인이 공개됩니다.</small>
          </section>
        </>
      )}
    </div>
  );
}
