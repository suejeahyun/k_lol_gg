import Link from "next/link";
import { ArrowRight, ExternalLink as ArrowUpRight, AppWindow as Building2, LibraryBig as Layers3, ShieldCheck } from "@/components/theme/theme-icons";
import { listHubCommunities } from "@/modules/community-network/infrastructure/hub-community-directory";
import { CommunityCards } from "./community-cards";
import { TemplateShowcase } from "./template-showcase";
import styles from "./hub.module.css";

export async function HubDirectory({ overview = false }: { overview?: boolean }) {
  const { communities, unavailable } = await listHubCommunities();
  return <main className={styles.page}>
    {overview ? <section className={styles.hero} aria-labelledby="hub-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><span /> YOUR COMMUNITY, YOUR HOME</p>
        <h1 id="hub-title">모이는 곳에서,<br /><em>함께하는 공간으로.</em></h1>
        <p className={styles.heroDescription}>우리만의 이름과 분위기, 함께할 멤버와 경기 기록.<br className={styles.desktopBreak} /> 커뮤니티 운영에 필요한 것들을 한곳에 담으세요.</p>
        <div className={styles.heroActions}><Link href="/sites/new" className={styles.primaryAction}>커뮤니티 만들기 <ArrowRight size={17} aria-hidden="true" /></Link><a href="#communities" className={styles.secondaryAction}>사이트 둘러보기 <ArrowUpRight size={17} aria-hidden="true" /></a></div>
        <p className={styles.heroNote}>누구나 신청하고, GG HUB 검토 후 개설됩니다.</p>
        <div className={styles.heroDetails}><span><strong>나만의 테마</strong>색상·소개·홈 구성</span><span><strong>필요한 기능만</strong>모집·회원·경기 관리</span><span><strong>독립된 운영</strong>사이트별 자료 보관</span></div>
      </div>
      <TemplateShowcase />
    </section> : <header className={styles.directoryHeading}><p className={styles.sectionEyebrow}>COMMUNITIES</p><h1>함께할 커뮤니티를 찾아보세요.</h1><p>공개된 사이트를 둘러보고 각 커뮤니티의 활동에 참여하세요.</p></header>}

    <section id="communities" className={styles.directory} aria-labelledby="communities-title">
      <div className={styles.sectionHeading}><div><p className={styles.sectionEyebrow}>EXPLORE COMMUNITIES</p><h2 id="communities-title">{unavailable ? "확인된 사이트" : "등록된 사이트"} <span>{communities.length}</span></h2></div><p>공개 소개를 확인하고 사이트로 이동하세요.</p></div>
      {unavailable && communities.length === 0 ? <div className={styles.empty} role="status"><h3>사이트 목록을 불러오지 못했습니다</h3><p>잠시 후 다시 확인해 주세요. 등록된 사이트가 없다는 뜻은 아닙니다.</p></div>
        : communities.length === 0 ? <div className={styles.empty}><Building2 size={30} aria-hidden="true" /><h3>첫 커뮤니티를 기다리고 있습니다</h3><p>테마와 기능을 선택해 우리 커뮤니티를 시작해 보세요.</p><Link href="/sites/new">개설 신청하기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
          : <CommunityCards communities={communities} />}
      <p className={styles.directoryNote}><ShieldCheck size={16} aria-hidden="true" /> 가입과 활동은 각 사이트에서 진행합니다. 이 목록은 가입한 사이트 목록이나 실시간 연결 상태가 아닙니다.</p>
      {unavailable && communities.length > 0 ? <p className={styles.directoryNote} role="status">일부 사이트 정보는 현재 불러오지 못했습니다. 확인된 사이트를 먼저 표시합니다.</p> : null}
    </section>
    {overview ? <>
      <section className={styles.startSteps} aria-labelledby="hub-start-title"><div><p className={styles.sectionEyebrow}>FROM IDEA TO COMMUNITY</p><h2 id="hub-start-title">우리 커뮤니티의<br />첫 시작을 함께.</h2><p>개설 이후에도 테마와 기능을 바꿀 수 있습니다.</p></div><ol><li><span>01</span><div><h3>우리답게 꾸미기</h3><p>테마를 고르고 이름·소개·필요한 기능을 설정하세요.</p></div></li><li><span>02</span><div><h3>신청하고 확인하기</h3><p>운영팀 검토 후 개설됩니다. 진행 상황은 내 사이트에서 확인하세요.</p></div></li><li><span>03</span><div><h3>멤버를 맞이하기</h3><p>사이트와 운영진 로그인을 확인한 뒤 공개하고 첫 모집을 시작하세요.</p></div></li></ol></section>
      <section className={styles.managementCallout} aria-labelledby="hub-management-title"><div><span className={styles.calloutIcon}><Layers3 size={24} aria-hidden="true" /></span><div><h2 id="hub-management-title">커뮤니티가 늘어도, 관리하는 곳은 하나.</h2><p>신청한 사이트의 진행 상태를 확인하고 테마와 기능을 관리하세요.</p></div></div><Link href="/sites">내 사이트 관리 <ArrowRight size={18} aria-hidden="true" /></Link></section>
    </> : null}
  </main>;
}
