import type { Metadata } from "next";
import Link from "next/link";
import styles from "../help.module.css";

export const metadata: Metadata = { title: "모집 이용 안내", alternates: { canonical: "/help/recruits" } };

export default function RecruitHelpPage(){return <div className={`page-wrap ${styles.page}`}><header className={styles.hero}><span>RECRUIT GUIDE</span><h1>파티·스크림 모집 이용 안내</h1><p>열린 모집 확인부터 안전한 상태 변경까지, 사이트가 적용하는 기준을 안내합니다.</p></header><section className={styles.section}><h2>사이트에서 확인하기</h2><ol><li><strong>파티 모집</strong>에서 게임 종류, 현재 인원과 예정 시간을 확인합니다.</li><li><strong>스크림 모집</strong>에서 BO 형식과 매칭 상태를 확인합니다.</li><li>종료·취소된 모집은 공개 목록에서 제외되며, 샘플 데이터는 표시하지 않습니다.</li></ol></section><section className={styles.section}><h2>모집 등록 기준</h2><ul><li>사이트 등록은 승인된 계정 세션과 멱등성 키, 최신 revision 조건을 모두 확인합니다.</li><li>같은 요청을 다시 보내면 중복 생성하지 않고 이전 결과를 반환합니다.</li><li>멤버 이름은 공개 목록에 노출하지 않고 인원수만 표시합니다.</li></ul></section><p className={styles.notice}>모집 수정이 충돌하면 목록을 새로 불러온 뒤 최신 ETag로 다시 요청해 주세요.</p><nav className={styles.links}><Link href="/recruits">현재 모집 보기</Link><Link href="/help/kakao">카카오 봇 안내</Link></nav></div>}
