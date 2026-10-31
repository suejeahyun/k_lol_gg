import Link from "next/link";
import type { CommunitySite } from "@/modules/community-sites/domain/community-site";
import { communitySiteOwnerGuidance } from "@/modules/community-sites/domain/owner-guidance";
import styles from "./site-workbench.module.css";

export function SiteOwnerGuidance({ site }: { site: CommunitySite }) {
  const guidance = communitySiteOwnerGuidance(site);
  const canVisit = site.origin && ["AWAITING_OWNER", "ACTIVATING", "ACTIVE"].includes(site.status);
  const published = site.publishedConfiguration;
  return <section className={styles.ownerGuide} aria-label="운영 시작 안내">
    <p className={styles.guideEyebrow}>다음 할 일</p><h2>{guidance.title}</h2><p>{guidance.description}</p>
    {canVisit ? <div className={styles.guideLinks}>
      <a href={`${site.origin}/admin/login`} target="_blank" rel="noopener noreferrer">내 사이트 관리자 열기 ↗</a>
      <a href={`${site.origin}/admin/community-introduction`} target="_blank" rel="noopener noreferrer">커뮤니티 소개 설정 ↗</a>
      {site.status === "ACTIVE" && published?.modules.recruiting ? <a href={`${site.origin}/recruits`} target="_blank" rel="noopener noreferrer">모집 화면 열기 ↗</a> : null}
    </div> : null}
    {site.status === "ACTIVE" ? <p className={styles.guideNote}>이 안내는 시작 방법입니다. 소개 작성·회원 초대·봇 연결의 실제 완료 여부를 확인한 상태는 아닙니다.</p> : null}
    <div className={styles.guideHelp}><Link href="/help/contact">GG HUB 운영팀에 문의</Link><span>문의할 때 신청번호 <code>{site.id}</code>를 함께 알려주세요.</span></div>
  </section>;
}
