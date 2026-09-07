import { Bot, CircleAlert, Clock3, DatabaseZap, MessagesSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { loadRuntimeRecruiting } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { loadRuntimeKakaoAdmin } from "@/modules/recruiting/kakao-admin/runtime";
import { readKakaoRuntimeConfiguration } from "@/modules/recruiting/kakao-admin/domain";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

import styles from "./kakao.module.css";
import { KakaoHealthRepair } from "./kakao-health-repair";
import { KakaoSettingsForm } from "./kakao-settings-form";

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
  const session = await requirePageRole("ADMIN", `/admin/kakao?tab=${tab}`);
  const [result, settingsResult] = await Promise.all([
    loadRuntimeRecruiting((service) => service.getAdminStatus()),
    loadRuntimeKakaoAdmin((service) => service.getSettings()),
  ]);
  const runtimeConfiguration = readKakaoRuntimeConfiguration();
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
      {tab === "stats" ? <section className={styles.summary} aria-label="Kakao 운영 요약"><article><MessagesSquare/><span>열린 파티</span><strong>{result.data.openPartyCount}</strong></article><article><Clock3/><span>진행 스크림</span><strong>{result.data.openScrimCount}</strong></article><article><DatabaseZap/><span>미해결 시즌 신청</span><strong>{result.data.unresolvedSeasonApplicationCount}</strong></article><article><DatabaseZap/><span>활성 이미지 세션</span><strong>{result.data.activeImageSessionCount}</strong></article><article><DatabaseZap/><span>대기 outbox</span><strong>{result.data.pendingOutboxCount}</strong></article><article><Clock3/><span>미완료 영수증</span><strong>{result.data.incompleteReceiptCount}</strong></article></section> : null}
      {tab === "recruits" ? <section className={styles.panel}><div className={styles.panelHead}><h2>최근 파티</h2><span>{result.data.recentParties.length}건</span></div>{result.data.recentParties.length===0?<p className={styles.empty}>저장된 파티가 없습니다.</p>:<div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>제목</th><th>상태</th><th>인원</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentParties.map((party)=><tr key={party.id}><td>#{party.recruitNumber}</td><td>{party.title}</td><td>{party.status}</td><td>{party.memberCount}/{party.maximumMembers}</td><td>{party.revision}</td><td><time dateTime={party.updatedAt}>{new Date(party.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</time></td></tr>)}</tbody></table></div>}</section> : null}
      {tab === "scrims" ? <section className={styles.panel}><div className={styles.panelHead}><h2>최근 스크림</h2><span>{result.data.recentScrims.length}건</span></div>{result.data.recentScrims.length===0?<p className={styles.empty}>저장된 스크림이 없습니다.</p>:<div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>요청 팀</th><th>상대 팀</th><th>상태</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentScrims.map((scrim)=><tr key={scrim.id}><td>#{scrim.scrimNumber}</td><td><code>{scrim.requesterTeamId.slice(0,8)}</code></td><td>{scrim.opponentTeamId?<code>{scrim.opponentTeamId.slice(0,8)}</code>:"—"}</td><td>{scrim.status}</td><td>{scrim.revision}</td><td><time dateTime={scrim.updatedAt}>{new Date(scrim.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</time></td></tr>)}</tbody></table></div>}</section> : null}
      {tab === "logs" ? <section className={styles.panel}><div className={styles.panelHead}><h2>최근 Kakao 요청 영수증</h2><span>{result.data.recentRequests.length}건</span></div>{result.data.recentRequests.length === 0 ? <p className={styles.empty}>아직 저장된 요청 영수증이 없습니다.</p> : <div className={styles.tableWrap}><table><thead><tr><th>범위</th><th>상태</th><th>수신</th><th>만료</th></tr></thead><tbody>{result.data.recentRequests.map((item, index) => <tr key={`${item.scope}-${item.createdAt}-${index}`}><td>{item.scope}</td><td>{item.completed ? item.responseStatus : "처리 중"}</td><td>{new Date(item.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td><td>{new Date(item.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td></tr>)}</tbody></table></div>}</section> : null}
      {tab === "settings" ? settingsResult.state === "ready" ? <section className={styles.panel}><div className={styles.panelHead}><h2>비밀값 제외 운영 설정</h2><span>{session.role === "SUPER_ADMIN" ? "SUPER 수정 가능" : "읽기 전용"}</span></div><div className={styles.settingsBody}><p>서명 키·허용 방·허용 발신자 원문은 서버 환경변수에만 두며 화면과 API에 노출하지 않습니다.</p>{session.role === "SUPER_ADMIN" ? <KakaoSettingsForm initial={settingsResult.data}/> : <p>설정 변경은 SUPER 관리자와 2단계 인증이 필요합니다.</p>}</div></section> : <section className={styles.state} role={settingsResult.state === "error" ? "alert" : "status"}><DatabaseZap/><h2>운영 설정을 불러올 수 없습니다.</h2><p>0022 migration과 데이터베이스 상태를 확인해 주세요.</p></section> : null}
      {tab === "health" ? <><section className={styles.health}><article><ShieldCheck/><div><h2>서명·허용 목록</h2><p>현재 키 {runtimeConfiguration.currentSigningKeyConfigured ? "설정" : "미설정"} · 방 {runtimeConfiguration.allowedRoomsConfigured ? "설정" : "미설정"} · 발신자 {runtimeConfiguration.allowedSendersConfigured ? "설정" : "미설정"}</p></div></article><article><Clock3/><div><h2>nonce·영수증</h2><p>활성 nonce {result.data.activeNonceCount} · 미완료 영수증 {result.data.incompleteReceiptCount}</p></div></article><article><DatabaseZap/><div><h2>세션·outbox</h2><p>활성 이미지 세션 {result.data.activeImageSessionCount} · 대기 outbox {result.data.pendingOutboxCount}</p></div></article></section>{session.role === "SUPER_ADMIN" && settingsResult.state === "ready" ? <section className={styles.panel}><div className={styles.panelHead}><h2>안전 복구 작업</h2><span>SUPER · 2단계 인증</span></div><div className={styles.settingsBody}><p>만료 시간이 지난 활성 이미지 수신 세션만 EXPIRED 상태로 전환합니다. 자산이나 신청 데이터는 삭제하지 않습니다.</p><KakaoHealthRepair revision={settingsResult.data.revision}/></div></section> : null}</> : null}
    </>:result.state==="unavailable"?<section className={styles.state} role="status"><DatabaseZap/><h2>모집 저장소를 사용할 수 없습니다.</h2><p>데이터베이스 연결과 0009 migration 상태를 확인해 주세요.</p></section>:<section className={styles.state} role="alert"><CircleAlert/><h2>모집 상태를 불러오지 못했습니다.</h2><p>서버 로그의 trace와 데이터베이스 상태를 확인해 주세요.</p></section>}
  </main>;
}
