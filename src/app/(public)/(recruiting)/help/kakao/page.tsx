import type { Metadata } from "next";
import Link from "next/link";
import styles from "../help.module.css";
import { SiteFeatureStatePanel } from "@/components/site-feature-state";
import { readSiteFeatureState, siteFeatureLabel } from "@/modules/operations/infrastructure/site-feature-access";

export const metadata: Metadata = { title: "카카오 봇 연동 안내", alternates: { canonical: "/help/kakao" } };

export default async function KakaoHelpPage(){
  const featureState = await readSiteFeatureState("kakaoHelp");
  if (featureState !== "enabled") return <div className={`page-wrap ${styles.page}`}><SiteFeatureStatePanel label={siteFeatureLabel("kakaoHelp")} state={featureState} /></div>;
  return <div className={`page-wrap ${styles.page}`}><header className={styles.hero}><span>KAKAO BOT</span><h1>카카오 모집 봇 연동 안내</h1><p>허용된 방과 운영자에서 전달된 서명 요청만 사이트 모집 상태에 반영됩니다.</p></header><section className={styles.section}><h2>지원하는 흐름</h2><ul><li><strong>파티</strong>: 생성, 인원 동기화, 상태 조회, 완료, 취소</li><li><strong>스크림</strong>: 생성, 참가, 재모집, 확정, 완료, 취소</li><li><strong>초기화</strong>: 봇 명령이 아닌 SUPER 관리자 작업으로만 처리</li></ul></section><section className={styles.section}><h2>안전한 전송 규칙</h2><ol><li>봇은 원문 본문과 전송 시각, nonce, 방·발신자 ID를 함께 서명합니다.</li><li>서버는 서명을 먼저 검증하고 성공한 본문만 해석합니다.</li><li>재전송은 같은 멱등성 키와 같은 본문일 때만 이전 결과로 수렴합니다.</li><li>봇 자신의 메시지와 허용 목록 밖의 요청은 처리하지 않습니다.</li></ol></section><p className={styles.notice}>실제 비밀키, 허용 방과 발신자 설정은 서버 환경 변수에서만 관리하며 이 화면이나 공개 API로 노출하지 않습니다.</p><nav className={styles.links}><Link href="/recruits">현재 모집 보기</Link><Link href="/help/recruits">모집 이용 안내</Link></nav></div>}
