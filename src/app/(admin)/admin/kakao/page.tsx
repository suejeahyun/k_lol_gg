import { Bot, CircleAlert, Clock3, DatabaseZap, MessagesSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { loadRuntimeRecruiting } from "@/modules/recruiting/infrastructure/runtime-recruiting";

import styles from "./kakao.module.css";

export const dynamic = "force-dynamic";

const KAKAO_TABS = ["recruits", "scrims", "stats", "settings", "logs", "health"] as const;
type KakaoTab = (typeof KAKAO_TABS)[number];

function normalizeTab(value: string | undefined): KakaoTab {
  return KAKAO_TABS.includes(value as KakaoTab) ? value as KakaoTab : "recruits";
}

export default async function AdminKakaoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = normalizeTab((await searchParams).tab);
  const result = await loadRuntimeRecruiting((service) => service.getAdminStatus());
  return <main className={styles.page}>
    <header className={styles.header}><div><span><Bot aria-hidden="true" /> KAKAO · S09</span><h1>카카오 연동 센터</h1><p>모집 현황과 연동 안전 상태를 화면별로 나누어 확인합니다.</p></div></header>
    <nav className={styles.tabs} aria-label="카카오 관리 화면">
      <Link aria-current={tab === "recruits" ? "page" : undefined} href="/admin/kakao?tab=recruits">파티</Link>
      <Link aria-current={tab === "scrims" ? "page" : undefined} href="/admin/kakao?tab=scrims">스크림</Link>
      <Link aria-current={tab === "stats" ? "page" : undefined} href="/admin/kakao?tab=stats">통계</Link>
      <Link aria-current={tab === "settings" ? "page" : undefined} href="/admin/kakao?tab=settings">설정</Link>
      <Link aria-current={tab === "logs" ? "page" : undefined} href="/admin/kakao?tab=logs">처리 상태</Link>
      <Link aria-current={tab === "health" ? "page" : undefined} href="/admin/kakao?tab=health">보안 점검</Link>
    </nav>
    {result.state === "ready" ? <>
      {tab === "stats" ? <section className={styles.summary} aria-label="모집 운영 요약"><article><MessagesSquare/><span>열린 파티</span><strong>{result.data.openPartyCount}</strong></article><article><Clock3/><span>진행 스크림</span><strong>{result.data.openScrimCount}</strong></article><article><DatabaseZap/><span>대기 outbox</span><strong>{result.data.pendingOutboxCount}</strong></article></section> : null}
      {tab === "recruits" ? <section className={styles.panel}><div className={styles.panelHead}><h2>최근 파티</h2><span>{result.data.recentParties.length}건</span></div>{result.data.recentParties.length===0?<p className={styles.empty}>저장된 파티가 없습니다.</p>:<div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>제목</th><th>상태</th><th>인원</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentParties.map((party)=><tr key={party.id}><td>#{party.recruitNumber}</td><td>{party.title}</td><td>{party.status}</td><td>{party.memberCount}/{party.maximumMembers}</td><td>{party.revision}</td><td><time dateTime={party.updatedAt}>{new Date(party.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</time></td></tr>)}</tbody></table></div>}</section> : null}
      {tab === "scrims" ? <section className={styles.panel}><div className={styles.panelHead}><h2>최근 스크림</h2><span>{result.data.recentScrims.length}건</span></div>{result.data.recentScrims.length===0?<p className={styles.empty}>저장된 스크림이 없습니다.</p>:<div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>요청 팀</th><th>상대 팀</th><th>상태</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentScrims.map((scrim)=><tr key={scrim.id}><td>#{scrim.scrimNumber}</td><td><code>{scrim.requesterTeamId.slice(0,8)}</code></td><td>{scrim.opponentTeamId?<code>{scrim.opponentTeamId.slice(0,8)}</code>:"—"}</td><td>{scrim.status}</td><td>{scrim.revision}</td><td><time dateTime={scrim.updatedAt}>{new Date(scrim.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</time></td></tr>)}</tbody></table></div>}</section> : null}
      {tab === "logs" ? <section className={styles.summary} aria-label="카카오 처리 상태"><article><DatabaseZap/><span>미발행 이벤트</span><strong>{result.data.pendingOutboxCount}</strong></article><article><MessagesSquare/><span>최근 파티 변경</span><strong>{result.data.recentParties.length}</strong></article><article><Clock3/><span>최근 스크림 변경</span><strong>{result.data.recentScrims.length}</strong></article></section> : null}
      {tab === "settings" ? <section className={styles.state}><ShieldCheck/><h2>비밀값은 서버 환경변수로만 관리합니다.</h2><p>서명 키·허용 방·허용 발신자 값은 이 화면에서 표시하거나 변경하지 않습니다.</p></section> : null}
      {tab === "health" ? <section className={styles.health}><article><ShieldCheck/><div><h2>원문 기반 HMAC 검증</h2><p>수신 본문을 파싱하기 전에 서명과 본문 해시를 대조합니다.</p></div></article><article><Clock3/><div><h2>시간·nonce 재전송 방어</h2><p>허용 시간창과 영속 nonce 영수증으로 중복 요청을 거부합니다.</p></div></article><article><DatabaseZap/><div><h2>트랜잭션·outbox</h2><p>데이터, 감사 기록, 발행 대기 이벤트를 하나의 트랜잭션으로 저장합니다.</p></div></article></section> : null}
    </>:result.state==="unavailable"?<section className={styles.state} role="status"><DatabaseZap/><h2>모집 저장소를 사용할 수 없습니다.</h2><p>데이터베이스 연결과 0009 migration 상태를 확인해 주세요.</p></section>:<section className={styles.state} role="alert"><CircleAlert/><h2>모집 상태를 불러오지 못했습니다.</h2><p>서버 로그의 trace와 데이터베이스 상태를 확인해 주세요.</p></section>}
  </main>;
}
