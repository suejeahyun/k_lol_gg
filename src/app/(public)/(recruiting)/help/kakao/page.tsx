import type { Metadata } from "next";
import Link from "next/link";
import styles from "../help.module.css";
import { SiteFeatureStatePanel } from "@/components/site-feature-state";
import { readSiteFeatureState, siteFeatureLabel } from "@/modules/operations/infrastructure/site-feature-access";

export const metadata: Metadata = { title: "카카오 봇 연동 안내", alternates: { canonical: "/help/kakao" } };

export default async function KakaoHelpPage(){
  const featureState = await readSiteFeatureState("kakaoHelp");
  if (featureState !== "enabled") return <div className={`page-wrap ${styles.page}`}><SiteFeatureStatePanel label={siteFeatureLabel("kakaoHelp")} state={featureState} /></div>;
  return <div className={`page-wrap ${styles.page}`}><header className={styles.hero}><span>KAKAO BOT</span><h1>카카오 모집 봇 연동 안내</h1><p>카카오톡에서 만든 파티와 스크림 모집을 사이트에서도 이어서 확인할 수 있어요.</p></header><section className={styles.section}><h2>지원하는 기능</h2><ul><li><strong>파티</strong>: 양식 만들기·수정, 인원·상세 확인, 번호 마감</li><li><strong>스크림</strong>: 양식 만들기·수정, 현황·상세 확인, 운영일 종료 시 자동 마감</li><li><strong>목록 확인</strong>: 현재 운영일의 진행 중인 모집을 사이트에서 함께 확인</li></ul></section><section className={styles.section}><h2>이용 안내</h2><ol><li>연동이 허용된 카카오톡 방에서 모집 명령을 사용합니다.</li><li>봇이 안내한 모집 번호와 현재 상태를 확인합니다.</li><li>변경된 인원과 상태는 사이트 모집 목록에도 반영됩니다.</li><li>운영일은 한국 시간 오전 6시에 바뀌며, 이전 운영일 스크림은 현황에서 제외됩니다.</li><li>처리되지 않는 명령은 방 운영자에게 문의해 주세요.</li></ol></section><p className={styles.notice}>계정과 대화방을 안전하게 확인한 요청만 모집에 반영됩니다.</p><nav className={styles.links}><Link href="/recruits">현재 모집 보기</Link><Link href="/help/recruits">모집 이용 안내</Link></nav></div>}
