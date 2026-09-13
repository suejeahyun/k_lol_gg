import type { Metadata } from "next";
import Link from "next/link";
import styles from "../help.module.css";

export const metadata: Metadata = { title: "모집 이용 안내", alternates: { canonical: "/help/recruits" } };

export default function RecruitHelpPage(){return <div className={`page-wrap ${styles.page}`}><header className={styles.hero}><span>RECRUIT GUIDE</span><h1>파티·스크림 모집 이용 안내</h1><p>열린 모집을 확인하고 함께할 팀원을 찾아보세요.</p></header><section className={styles.section}><h2>사이트에서 확인하기</h2><ol><li><strong>파티 모집</strong>에서 게임 종류, 현재 인원, 참여자 이름·포지션과 예정 시간을 확인합니다.</li><li><strong>스크림 모집</strong>에서 BO 형식과 매칭 상태를 확인합니다.</li><li>종료·취소된 모집은 목록에서 제외되며 현재 참여 가능한 모집이 먼저 표시됩니다.</li></ol></section><section className={styles.section}><h2>모집 등록 안내</h2><ul><li>승인된 계정으로 로그인하면 모집을 등록하고 관리할 수 있습니다.</li><li>같은 요청이 반복되어도 모집은 한 번만 등록됩니다.</li><li>모집에 작성한 참여자 표시 이름, 포지션과 예비 여부는 현재 모집 카드에 공개됩니다.</li><li>로그인 ID, 연락처, 방·발신자 식별값과 운영 메모는 공개하지 않습니다.</li></ul></section><p className={styles.notice}>다른 곳에서 모집 내용이 바뀌었다면 목록을 새로고침한 뒤 다시 시도해 주세요.</p><nav className={styles.links}><Link href="/recruits">현재 모집 보기</Link><Link href="/help/kakao">카카오 봇 안내</Link></nav></div>}
