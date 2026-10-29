import Link from "next/link";
import { ArrowRight, ExternalLink } from "@/components/theme/theme-icons";
import { IntroductionContent } from "@/components/community-introduction/introduction-content";
import type { loadHubCommunityIntroduction } from "@/modules/community-network/infrastructure/hub-community-directory";
import styles from "./hub.module.css";

type Community = Readonly<{ id: string; name: string; origin: string; description: string }>;
type IntroductionResult = Awaited<ReturnType<typeof loadHubCommunityIntroduction>>;
const fallbackMessages = {
  unpublished: "아직 공개된 상세 소개가 없습니다. 등록된 기본 소개를 확인해 주세요.",
  unavailable: "지금은 상세 소개를 불러오지 못했습니다. 등록된 기본 소개와 사이트 방문은 이용할 수 있습니다.",
  unsupported: "이 사이트의 상세 소개는 준비 중입니다. 등록된 기본 소개를 확인해 주세요.",
} as const;

export function HubCommunityDetail({ community, introduction }: { community: Community; introduction: IntroductionResult }) {
  return <main className={styles.page}>
    <Link className={styles.backLink} href="/community-network">← 사이트 둘러보기</Link>
    <header className={styles.detailHeader}><div><p className={styles.sectionEyebrow}>COMMUNITY PROFILE</p><h1>{community.name}</h1><span>{new URL(community.origin).hostname}</span></div>
      <a className={styles.detailVisit} href={community.origin} target="_blank" rel="noopener noreferrer">사이트 방문 <ExternalLink size={18} aria-hidden="true" /><span className="sr-only"> (새 창)</span></a>
    </header>
    <article className={styles.detailBody}>
      {introduction.state === "ready" ? <><IntroductionContent profile={introduction.data.profile} />
        <p className={styles.introductionUpdated}>사이트 운영진이 작성한 소개 · <time dateTime={introduction.data.updatedAt}>{new Date(introduction.data.updatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</time> 수정</p></>
        : <><p className={styles.introductionStatus} role="status">{fallbackMessages[introduction.state]}</p>
          <section className={styles.registeredIntroduction}><h2>등록된 기본 소개</h2><p>{community.description || "사이트에서 커뮤니티의 활동과 소식을 확인해 보세요."}</p></section></>}
    </article>
    <div className={styles.detailFoot}><p>가입과 활동은 해당 사이트에서 진행합니다.</p><Link href="/community-network">다른 커뮤니티 둘러보기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
  </main>;
}

export function HubCommunityDetailUnavailable() {
  return <main className={styles.page}><Link className={styles.backLink} href="/community-network">← 사이트 둘러보기</Link>
    <section className={styles.empty} role="status"><h1>커뮤니티 정보를 불러오지 못했습니다</h1><p>잠시 후 다시 확인해 주세요. 사이트가 삭제되었다는 뜻은 아닙니다.</p></section></main>;
}
