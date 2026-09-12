import {
  Bot,
  CircleAlert,
  Clock3,
  DatabaseZap,
  MessagesSquare,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import type { PartyMemberStatisticsDto } from "@/modules/recruiting/application/ports";
import {
  PARTY_MEMBER_STATS_MAXIMUM_QUERY_LENGTH,
  PARTY_MEMBER_STATS_MINIMUM_QUERY_LENGTH,
  parsePartyMemberStatsQuery,
} from "@/modules/recruiting/application/party-member-statistics";
import { loadRuntimeRecruiting } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { readKakaoRuntimeConfiguration } from "@/modules/recruiting/kakao-admin/domain";
import { loadRuntimeKakaoAdmin } from "@/modules/recruiting/kakao-admin/runtime";
import {
  kakaoAdminRequiredRole,
  parseKakaoAdminTabQuery,
} from "@/modules/recruiting/kakao-admin/tab-query";

import { KakaoHealthRepair } from "./kakao-health-repair";
import { KakaoSettingsForm } from "./kakao-settings-form";
import styles from "./kakao.module.css";

export const dynamic = "force-dynamic";

function koreanDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function PartyMemberStats({ data }: { data: PartyMemberStatisticsDto }) {
  return <section className={styles.statsResults} aria-label="검색한 플레이어의 파티 통계">
    <div className={styles.panelHead}>
      <h2>이름 검색 결과</h2>
      <span>최근 {data.lookbackDays}일 · 최대 {data.resultLimit}명</span>
    </div>
    {data.items.length === 0
      ? <p className={styles.empty}>일치하는 파티 참여자를 찾지 못했습니다.</p>
      : <div className={styles.memberStatsGrid}>{data.items.map((item) => <article className={styles.memberStat} key={item.name}>
        <div className={styles.memberStatHead}>
          <div><UsersRound aria-hidden="true"/><strong>{item.name}</strong></div>
          <span>총 {item.totalPartyCount}회 참여</span>
        </div>
        <dl className={styles.statusMetrics}>
          <div><dt>진행</dt><dd>{item.inProgressCount}</dd></div>
          <div><dt>완료</dt><dd>{item.finishedCount}</dd></div>
          <div><dt>취소</dt><dd>{item.canceledCount}</dd></div>
          <div><dt>초기화</dt><dd>{item.resetCount}</dd></div>
        </dl>
        <div className={styles.companions}>
          <h3>자주 함께한 사람</h3>
          {item.companions.length === 0
            ? <p>함께한 참여자 기록이 없습니다.</p>
            : <ol>{item.companions.map((companion) => <li key={companion.name}>
              <span>{companion.name}</span><strong>{companion.partyCount}회</strong>
            </li>)}</ol>}
        </div>
      </article>)}</div>}
    <p className={styles.statsBoundary}>최근 파티 {data.scannedPartyLimit.toLocaleString("ko-KR")}건까지만 안전하게 집계합니다.</p>
  </section>;
}

export default async function AdminKakaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const tab = parseKakaoAdminTabQuery(resolvedSearchParams);
  if (!tab) notFound();

  const requiredRole = kakaoAdminRequiredRole(tab);
  const session = await requirePageRole(requiredRole, `/admin/kakao?tab=${tab}`);
  const statsQuery = parsePartyMemberStatsQuery(resolvedSearchParams.q);
  const [result, settingsResult, memberStatsResult] = await Promise.all([
    loadRuntimeRecruiting((service) => service.getAdminStatus()),
    session.role === "SUPER_ADMIN" && (tab === "settings" || tab === "health")
      ? loadRuntimeKakaoAdmin((service) => service.getSettings())
      : Promise.resolve(null),
    tab === "stats" && statsQuery.state === "ready"
      ? loadRuntimeRecruiting((service) => service.getPartyMemberStats(statsQuery.query))
      : Promise.resolve(null),
  ]);
  const runtimeConfiguration = readKakaoRuntimeConfiguration();

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span><Bot aria-hidden="true"/> KAKAO · S09</span><h1>카카오 연동 센터</h1><p>모집 현황과 연동 안전 상태를 화면별로 나누어 확인합니다.</p></div>
    </header>

    <nav className={styles.tabs} aria-label="카카오 관리 화면">
      <Link aria-current={tab === "recruits" ? "page" : undefined} href="/admin/kakao?tab=recruits">파티</Link>
      <Link aria-current={tab === "scrims" ? "page" : undefined} href="/admin/kakao?tab=scrims">스크림</Link>
      <Link aria-current={tab === "stats" ? "page" : undefined} href="/admin/kakao?tab=stats">통계</Link>
      {session.role === "SUPER_ADMIN" ? <>
        <Link aria-current={tab === "settings" ? "page" : undefined} href="/admin/kakao?tab=settings">설정</Link>
        <Link aria-current={tab === "logs" ? "page" : undefined} href="/admin/kakao?tab=logs">처리 상태</Link>
        <Link aria-current={tab === "health" ? "page" : undefined} href="/admin/kakao?tab=health">보안 점검</Link>
        <Link href="/admin/kakao/rooms">레거시 방 권한</Link>
      </> : null}
    </nav>

    {result.state === "ready" ? <>
      {tab === "stats" ? <>
        <section className={styles.summary} aria-label="Kakao 운영 요약">
          <article><MessagesSquare/><span>열린 파티</span><strong>{result.data.openPartyCount}</strong></article>
          <article><Clock3/><span>진행 스크림</span><strong>{result.data.openScrimCount}</strong></article>
          <article><DatabaseZap/><span>미해결 시즌 신청</span><strong>{result.data.unresolvedSeasonApplicationCount}</strong></article>
          <article><DatabaseZap/><span>활성 이미지 세션</span><strong>{result.data.activeImageSessionCount}</strong></article>
          <article><DatabaseZap/><span>대기 outbox</span><strong>{result.data.pendingOutboxCount}</strong></article>
          <article><Clock3/><span>미완료 영수증</span><strong>{result.data.incompleteReceiptCount}</strong></article>
        </section>
        <section className={styles.statsSearch}>
          <div><Search aria-hidden="true"/><div><h2>플레이어 파티 통계</h2><p>이름을 검색해 참여 상태와 함께한 사람을 확인합니다.</p></div></div>
          <form method="get">
            <input name="tab" type="hidden" value="stats"/>
            <label htmlFor="party-member-query">플레이어 이름</label>
            <div><input
              defaultValue={statsQuery.query}
              id="party-member-query"
              maxLength={PARTY_MEMBER_STATS_MAXIMUM_QUERY_LENGTH}
              minLength={PARTY_MEMBER_STATS_MINIMUM_QUERY_LENGTH}
              name="q"
              placeholder="두 글자 이상 입력"
              type="search"
            /><button type="submit">검색</button></div>
          </form>
          {statsQuery.state === "invalid" ? <p className={styles.queryError} role="alert">이름은 제어 문자 없이 {PARTY_MEMBER_STATS_MINIMUM_QUERY_LENGTH}~{PARTY_MEMBER_STATS_MAXIMUM_QUERY_LENGTH}자로 입력해 주세요.</p> : null}
        </section>
        {memberStatsResult?.state === "ready" ? <PartyMemberStats data={memberStatsResult.data}/> : null}
        {memberStatsResult?.state === "unavailable" ? <section className={styles.state} role="status"><DatabaseZap/><h2>상세 통계를 사용할 수 없습니다.</h2><p>데이터베이스 연결 상태를 확인해 주세요.</p></section> : null}
        {memberStatsResult?.state === "error" ? <section className={styles.state} role="alert"><CircleAlert/><h2>상세 통계를 불러오지 못했습니다.</h2><p>검색 조건과 데이터베이스 상태를 확인해 주세요.</p></section> : null}
      </> : null}

      {tab === "recruits" ? <section className={styles.panel}>
        <div className={styles.panelHead}><h2>최근 파티</h2><span>{result.data.recentParties.length}건</span></div>
        {result.data.recentParties.length === 0 ? <p className={styles.empty}>저장된 파티가 없습니다.</p> : <div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>제목</th><th>상태</th><th>인원</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentParties.map((party) => <tr key={party.id}><td>#{party.recruitNumber}</td><td>{party.title}</td><td>{party.status}</td><td>{party.memberCount}/{party.maximumMembers}</td><td>{party.revision}</td><td><time dateTime={party.updatedAt}>{koreanDateTime(party.updatedAt)}</time></td></tr>)}</tbody></table></div>}
      </section> : null}

      {tab === "scrims" ? <section className={styles.panel}>
        <div className={styles.panelHead}><h2>최근 스크림</h2><span>{result.data.recentScrims.length}건</span></div>
        {result.data.recentScrims.length === 0 ? <p className={styles.empty}>저장된 스크림이 없습니다.</p> : <div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>요청 팀</th><th>상대 팀</th><th>상태</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentScrims.map((scrim) => <tr key={scrim.id}><td>#{scrim.scrimNumber}</td><td>{scrim.requesterTeamName ?? (scrim.requesterTeamId ? <code>{scrim.requesterTeamId.slice(0, 8)}</code> : "기록 없음")}</td><td>{scrim.opponentTeamName ?? (scrim.opponentTeamId ? <code>{scrim.opponentTeamId.slice(0, 8)}</code> : "—")}</td><td>{scrim.status}</td><td>{scrim.revision}</td><td><time dateTime={scrim.updatedAt}>{koreanDateTime(scrim.updatedAt)}</time></td></tr>)}</tbody></table></div>}
      </section> : null}

      {tab === "logs" ? <section className={styles.panel}>
        <div className={styles.panelHead}><h2>최근 Kakao 요청 영수증</h2><span>{result.data.recentRequests.length}건</span></div>
        {result.data.recentRequests.length === 0 ? <p className={styles.empty}>아직 저장된 요청 영수증이 없습니다.</p> : <div className={styles.tableWrap}><table><thead><tr><th>범위</th><th>상태</th><th>수신</th><th>만료</th></tr></thead><tbody>{result.data.recentRequests.map((item, index) => <tr key={`${item.scope}-${item.createdAt}-${index}`}><td>{item.scope}</td><td>{item.completed ? item.responseStatus : "처리 중"}</td><td>{koreanDateTime(item.createdAt)}</td><td>{koreanDateTime(item.expiresAt)}</td></tr>)}</tbody></table></div>}
      </section> : null}

      {tab === "settings" ? settingsResult?.state === "ready" ? <section className={styles.panel}>
        <div className={styles.panelHead}><h2>비밀값 제외 운영 설정</h2><span>SUPER 수정 가능</span></div>
        <div className={styles.settingsBody}><p>서명 키와 비상 bootstrap 방·발신자 원문은 서버 환경변수에만 두며 화면과 API에 노출하지 않습니다. 현재 V1 strict R8/V4는 프로필별 installation scope로 검증하며, canonical DB registry는 레거시 endpoint에만 적용됩니다.</p><KakaoSettingsForm initial={settingsResult.data}/></div>
      </section> : <section className={styles.state} role={settingsResult?.state === "error" ? "alert" : "status"}><DatabaseZap/><h2>운영 설정을 불러올 수 없습니다.</h2><p>0022 migration과 데이터베이스 상태를 확인해 주세요.</p></section> : null}

      {tab === "health" ? <>
        <section className={styles.health}>
          <article><ShieldCheck/><div><h2>서명·비상 bootstrap</h2><p>현재 키 {runtimeConfiguration.currentSigningKeyConfigured ? "설정" : "미설정"} · bootstrap 방 {runtimeConfiguration.allowedRoomsConfigured ? "설정" : "미설정"} · 발신자 {runtimeConfiguration.allowedSendersConfigured ? "설정" : "미설정"}</p></div></article>
          <article><Clock3/><div><h2>nonce·영수증</h2><p>활성 nonce {result.data.activeNonceCount} · 미완료 영수증 {result.data.incompleteReceiptCount}</p></div></article>
          <article><DatabaseZap/><div><h2>세션·outbox</h2><p>활성 이미지 세션 {result.data.activeImageSessionCount} · 대기 outbox {result.data.pendingOutboxCount}</p></div></article>
        </section>
        {settingsResult?.state === "ready" ? <section className={styles.panel}><div className={styles.panelHead}><h2>안전 복구 작업</h2><span>SUPER · 2단계 인증</span></div><div className={styles.settingsBody}><p>만료 시간이 지난 활성 이미지 수신 세션만 EXPIRED 상태로 전환합니다. 자산이나 신청 데이터는 삭제하지 않습니다.</p><KakaoHealthRepair revision={settingsResult.data.revision}/></div></section> : null}
      </> : null}
    </> : result.state === "unavailable" ? <section className={styles.state} role="status"><DatabaseZap/><h2>모집 저장소를 사용할 수 없습니다.</h2><p>데이터베이스 연결과 0009 migration 상태를 확인해 주세요.</p></section> : <section className={styles.state} role="alert"><CircleAlert/><h2>모집 상태를 불러오지 못했습니다.</h2><p>서버 로그의 trace와 데이터베이스 상태를 확인해 주세요.</p></section>}
  </main>;
}
