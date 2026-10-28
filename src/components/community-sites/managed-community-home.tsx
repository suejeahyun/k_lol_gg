import Link from "next/link";
import { readRuntimeCommunitySiteConfiguration } from "@/modules/community-sites/infrastructure/runtime-site-configuration";
import { getVisibleCommunityHomeSections } from "@/modules/community-sites/domain/site-configuration";
import { loadRuntimeHomeSnapshot } from "@/modules/home/infrastructure/runtime-home-data";
import styles from "./managed-community.module.css";

const destinations = { recruiting: "/recruits", competitions: "/competitions", matches: "/matches", rankings: "/rankings", media: "/images", members: "/players", introduction: "/account" };
export async function ManagedCommunityHome() {
  let runtime;
  try { runtime = await readRuntimeCommunitySiteConfiguration(); } catch { return null; }
  if (!runtime) return null;
  const config = runtime.configuration;
  const data = await loadRuntimeHomeSnapshot();
  const snapshot = data.state === "ready" ? data.snapshot : null;
  return <main className={styles.home}>
    <section className={styles.hero}>
      {config.bannerUrl ? /* eslint-disable-next-line @next/next/no-img-element -- Direct user-owned image, no server-side proxy. */
        <img className={styles.banner} src={config.bannerUrl} alt="" referrerPolicy="no-referrer" /> : null}
      <div className={styles.heroCopy}><p>OUR COMMUNITY</p><h1>{config.name}</h1><span>{config.description || "함께할 사람들과 우리만의 순간을 만들어 보세요."}</span>
        <div className={styles.heroActions}><Link href="/signup">함께하기 →</Link>{config.modules.recruiting ? <Link href="/recruits">모집 둘러보기</Link> : <Link href="/account">내 계정</Link>}</div>
      </div>
    </section>
    {data.state !== "ready" ? <p className={styles.notice} role="status">현재 활동 정보를 불러오지 못했습니다. 각 메뉴에서 다시 확인해 주세요.</p> : null}
    <div className={styles.grid}>{getVisibleCommunityHomeSections(config).filter((section) => section.id !== "introduction").map((section) => <section key={section.id} className={styles.block} data-section={section.id}>
      <header><h2>{section.label}</h2><Link href={destinations[section.id]}>모두 보기 →</Link></header>
      {!snapshot ? <p>잠시 후 다시 확인해 주세요.</p> : section.id === "recruiting" ? snapshot.feeds.recruits.length ? <ul>{snapshot.feeds.recruits.map((item) => <li key={`${item.kind}-${item.id}`}><Link href="/recruits"><strong>{item.title}</strong><span>{item.summary}</span></Link></li>)}</ul> : <p>{section.emptyText}</p>
        : section.id === "matches" ? snapshot.feeds.recentMatches.length ? <ul>{snapshot.feeds.recentMatches.map((item) => <li key={item.id}><Link href={`/matches/${item.id}`}><strong>{item.title}</strong><span>{item.playedOn} · {item.blueWins} : {item.redWins}</span></Link></li>)}</ul> : <p>{section.emptyText}</p>
          : section.id === "competitions" ? snapshot.feeds.competitions.length ? <ul>{snapshot.feeds.competitions.map((item) => <li key={`${item.kind}-${item.id}`}><Link href={`/competitions/${item.kind === "EVENT" ? "events" : "destruction"}/${item.id}`}><strong>{item.title}</strong><span>참가 {item.participantCount}명</span></Link></li>)}</ul> : <p>{section.emptyText}</p>
            : section.id === "members" ? <p className={styles.metric}><strong>{snapshot.activePlayerCount}</strong>명의 활동 선수</p>
              : section.id === "rankings" ? <p>{snapshot.publishedMatchCount ? `${snapshot.publishedMatchCount}개의 확정 경기와 우리 커뮤니티 순위를 확인하세요.` : section.emptyText}</p>
                : <p>갤러리에서 함께한 사진과 하이라이트를 확인하세요.</p>}
    </section>)}</div>
  </main>;
}
