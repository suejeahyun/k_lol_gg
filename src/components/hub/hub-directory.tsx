import Link from "next/link";
import { ArrowRight, ExternalLink as ArrowUpRight, AppWindow as Building2, LibraryBig as Layers3, Share2 as Network, ShieldCheck } from "@/components/theme/theme-icons";
import { loadRuntimeCommunityNetwork } from "@/modules/community-network/infrastructure/runtime";
import { getRuntimeCommunitySitesRepository } from "@/modules/community-sites/infrastructure/runtime";
import styles from "./hub.module.css";

export async function HubDirectory({ overview = false }: { overview?: boolean }) {
  const result = await loadRuntimeCommunityNetwork((repository) => repository.getPublicDirectory());
  const managedRepository = getRuntimeCommunitySitesRepository();
  let managedSites: Awaited<ReturnType<NonNullable<typeof managedRepository>["getPublicSites"]>> = [];
  let managedUnavailable = false;
  if (managedRepository) {
    try { managedSites = await managedRepository.getPublicSites(); } catch { managedUnavailable = true; }
  }
  const communities = [...(result.state === "ready" ? result.data : []), ...managedSites.filter((site) => result.state !== "ready" || !result.data.some((item) => item.origin === site.origin))];
  return <main className={styles.page}>
    {overview ? <section className={styles.hero} aria-labelledby="hub-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><span /> COMMUNITY CONTROL CENTER</p>
        <h1 id="hub-title">독립된 커뮤니티,<br />하나의 운영 공간.</h1>
        <p className={styles.heroDescription}>우리만의 테마로 커뮤니티를 시작하세요.<br className={styles.desktopBreak} /> 필요한 기능을 골라 사이트를 만들고, 한곳에서 관리할 수 있습니다.</p>
        <div className={styles.heroActions}><Link href="/sites/new" className={styles.primaryAction}>커뮤니티 만들기 <ArrowRight size={17} aria-hidden="true" /></Link><a href="#communities" className={styles.secondaryAction}>사이트 둘러보기 <ArrowUpRight size={17} aria-hidden="true" /></a></div>
      </div>
      <div className={styles.topology} aria-label="중앙 사이트에서 여러 독립 커뮤니티를 관리하는 구조">
        <div className={styles.centralNode}><Network aria-hidden="true" /><strong>GG HUB</strong><span>중앙 관리 사이트</span></div>
        <div className={styles.branchLine} />
        <div className={styles.childNodes}><span><Building2 aria-hidden="true" /><strong>K-LOL</strong><small>독립 사이트</small></span><span><Building2 aria-hidden="true" /><strong>NEXUS</strong><small>독립 사이트</small></span><span><Layers3 aria-hidden="true" /><strong>새 커뮤니티</strong><small>계속 확장</small></span></div>
        <p>테마 선택 · 개설 신청 · 사이트 운영</p>
      </div>
    </section> : <header className={styles.directoryHeading}><p className={styles.sectionEyebrow}>COMMUNITIES</p><h1>함께할 커뮤니티를 찾아보세요.</h1><p>공개된 사이트를 둘러보고 각 커뮤니티의 활동에 참여하세요.</p></header>}

    <section id="communities" className={styles.directory} aria-labelledby="communities-title">
      <div className={styles.sectionHeading}><div><p className={styles.sectionEyebrow}>EXPLORE COMMUNITIES</p><h2 id="communities-title">등록된 사이트 {result.state === "ready" ? <span>{communities.length}</span> : null}</h2></div><p>공개 소개를 확인하고 사이트로 이동하세요.</p></div>
      {result.state !== "ready" ? <div className={styles.empty} role="status"><h3>사이트 목록을 불러오지 못했습니다</h3><p>잠시 후 다시 확인해 주세요. 등록된 사이트가 없다는 뜻은 아닙니다.</p></div>
        : communities.length === 0 ? <div className={styles.empty}><Building2 size={30} aria-hidden="true" /><h3>첫 커뮤니티를 기다리고 있습니다</h3><p>테마와 기능을 선택해 우리 커뮤니티를 시작해 보세요.</p><Link href="/sites/new">개설 신청하기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
          : <div className={styles.grid}>{communities.map((community) => <article key={community.id} className={styles.siteCard}>
            <div className={styles.cardTop}><span className={styles.monogram} aria-hidden="true">{Array.from(community.name)[0]}</span><span className={styles.siteType}>독립 커뮤니티</span></div>
            <h3>{community.name}</h3><p className={styles.siteDescription}>{community.description || "사이트에서 커뮤니티의 활동과 소식을 확인해 보세요."}</p>
            <span className={styles.origin}>{new URL(community.origin).hostname}</span>
            <a href={community.origin} target="_blank" rel="noopener noreferrer">사이트 방문<ArrowUpRight size={19} aria-hidden="true" /><span className="sr-only"> (새 창)</span></a>
          </article>)}</div>}
      <p className={styles.directoryNote}><ShieldCheck size={16} aria-hidden="true" /> 가입과 활동은 각 사이트에서 진행합니다. 이 목록은 가입한 사이트 목록이나 실시간 연결 상태가 아닙니다.</p>
      {managedUnavailable ? <p className={styles.directoryNote} role="status">새로 개설된 사이트 목록은 현재 불러오지 못했습니다.</p> : null}
    </section>
    {overview ? <section className={styles.managementCallout} aria-labelledby="hub-management-title"><div><span className={styles.calloutIcon}><Layers3 size={24} aria-hidden="true" /></span><div><h2 id="hub-management-title">커뮤니티가 늘어도, 관리하는 곳은 하나.</h2><p>사이트마다 대화방·구인구직방을 구성하고 필요한 방을 더 등록할 수 있습니다.</p></div></div><Link href="/admin/community-network">사이트와 방 관리 <ArrowRight size={18} aria-hidden="true" /></Link></section> : null}
  </main>;
}
