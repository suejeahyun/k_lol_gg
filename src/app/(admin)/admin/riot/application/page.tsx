import Link from "next/link";
import styles from "./page.module.css";

export const dynamic = "force-static";

type CopyBlock = {
  title: string;
  description: string;
  body: string;
};

type ChecklistGroup = {
  title: string;
  items: string[];
};

const applicationBlocks: CopyBlock[] = [
  {
    title: "Product overview",
    description: "Developer Portal 제품 설명 또는 신청서 첫 문단에 사용합니다.",
    body: `K-LOL.GG is a League of Legends community platform currently used by approximately 150 players. The service supports in-house match records, player profiles, recruitment, community tournament operations, team balancing, and administrative tools.

The product is operated as a live web service for a Korean League of Legends community. Riot API integration will be used to improve the accuracy of player profiles, ranked information, tournament verification, and team balancing workflows.`,
  },
  {
    title: "Riot API usage purpose",
    description: "Riot API 사용 목적 항목에 사용합니다.",
    body: `We plan to use the Riot Games API to allow users to connect their Riot account using Riot ID, retrieve their ranked solo queue information, and summarize recent ranked match history.

This data will be used for player profile display, fairer team balancing, participant verification for community tournaments, and administrative review. Riot data will be used as a supporting signal and will not replace administrator judgment for community operations.`,
  },
  {
    title: "Security and caching statement",
    description: "API Key 보안과 Rate Limit 대응 설명에 사용합니다.",
    body: `All Riot API requests are made server-side through K-LOL.GG internal API routes. The Riot API key is stored only in server environment variables and is never exposed to client-side code.

Riot account data, ranked data, and match summaries are cached in our PostgreSQL database. Pages read cached data from our database and do not call Riot APIs directly on page load. We also keep API request logs, sync job records, cooldown controls, and admin-only sync controls to reduce unnecessary requests and comply with rate limits.`,
  },
  {
    title: "User flow for review",
    description: "심사자가 확인할 수 있는 시연 흐름 설명입니다.",
    body: `Review flow:
1. Log in to K-LOL.GG.
2. Open My Page > Riot Account.
3. Enter Riot ID and connect the account.
4. Open a player profile and view the ranked solo queue summary.
5. Open the Riot detailed player page to review recent ranked match summaries.
6. Open the admin Riot dashboard to review account status, sync jobs, and API logs.
7. Open tournament participant pages to see Riot verification badges.
8. Open the team balance page to see Riot data used as an optional supporting signal.`,
  },
  {
    title: "Non-affiliation notice",
    description: "Riot 안내 페이지와 신청서 하단에 함께 사용하는 문구입니다.",
    body: `K-LOL.GG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.`,
  },
  {
    title: "Rollout plan after approval",
    description: "Production Key 승인 후 운영 계획 설명입니다.",
    body: `After Production API approval, we will enable the Riot feature flag in production and roll out the feature gradually. We will first test a single admin account, then a small group of connected players, and then enable the feature for general users.

Bulk synchronization is limited to small batches to avoid serverless timeouts and unnecessary API usage. Failed accounts can be retried separately by administrators.`,
  },
];

const checklistGroups: ChecklistGroup[] = [
  {
    title: "신청 전 필수 확인",
    items: [
      "/terms, /privacy, /riot-api 페이지 공개 상태 확인",
      "Riot 기능이 RIOT_FEATURE_ENABLED=false 상태에서도 안전하게 비활성 처리되는지 확인",
      "Riot API Key가 NEXT_PUBLIC_ 환경변수로 선언되지 않았는지 확인",
      "GitHub 또는 배포 로그에 RGAPI Key가 남아 있지 않은지 확인",
      "관리자 Riot 대시보드, 계정 목록, 로그, 동기화 페이지 접속 확인",
      "유저 Riot 연동 화면과 모바일 /app/me/riot 화면 접속 확인",
    ],
  },
  {
    title: "신청서에 넣을 사이트 흐름",
    items: [
      "/me/riot: Riot ID 연결 화면",
      "/players/[playerId]/riot: Riot 솔랭 상세 화면",
      "/admin/riot: 관리자 Riot 대시보드",
      "/admin/riot/accounts: 연결 계정 목록",
      "/admin/riot/logs: API 호출 및 연동 감사 로그",
      "/admin/riot/sync: 동기화 작업 이력과 배치 제어",
      "/participation/destruction/[id]/participants: 멸망전 Riot 검증 표시",
      "/players/balance: 팀 밸런스 Riot 보조 정보 표시",
    ],
  },
  {
    title: "승인 후 활성화 순서",
    items: [
      "Vercel Production Environment Variables에 RIOT_API_KEY 등록",
      "RIOT_FEATURE_ENABLED=true로 변경",
      "관리자 계정 1명으로 Riot 연결 및 단일 동기화 테스트",
      "5명 이하 소규모 동기화 테스트",
      "20~30명 단위 배치 동기화 테스트",
      "실패 계정 재시도 및 로그 확인",
      "일반 유저에게 Riot 연동 기능 공개",
    ],
  },
];

const applicationMeta = [
  ["Product name", "K-LOL.GG"],
  ["Product type", "Production web application"],
  ["Game", "League of Legends"],
  ["Primary region", "KR / Asia routing"],
  ["Current user scale", "Approximately 150 community players"],
  ["Requested APIs", "Account, Summoner, League, Match"],
  ["Tournament API", "Not required for first approval request"],
  ["Data storage", "Server-side PostgreSQL cache"],
];

export default function RiotProductionApplicationPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>RIOT PRODUCTION APPLICATION</p>
          <h1 className={styles.title}>Production 신청 자료</h1>
          <p className={styles.desc}>
            Riot Developer Portal 제품 등록과 Production Key 신청에 사용할 영문 설명, 보안 설명, 시연 흐름, 승인 후 활성화 순서를 정리합니다.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/admin/riot">Riot 관리</Link>
          <Link className={styles.secondaryButton} href="/riot-api">Riot 안내</Link>
          <Link className={styles.secondaryButton} href="/privacy">개인정보처리방침</Link>
        </div>
      </header>

      <section className={styles.warningBox}>
        <strong>신청 전 운영 원칙</strong>
        <p>
          Production Key 승인 전까지 실제 운영 전체 동기화는 열지 않습니다. 현재 화면·DB·로그·보안 구조를 먼저 보여주고,
          승인 후 환경변수와 기능 플래그를 바꿔 단계적으로 활성화하는 구조입니다.
        </p>
      </section>

      <section className={styles.metaGrid} aria-label="Application metadata">
        {applicationMeta.map(([label, value]) => (
          <div className={styles.metaCard} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className={styles.sectionHeader}>
        <p className={styles.eyebrow}>COPY BLOCKS</p>
        <h2>신청서 복사용 영문 문구</h2>
        <p>아래 문구는 Riot Developer Portal의 제품 설명, API 사용 목적, 보안 설명, 심사자 확인 흐름에 그대로 사용할 수 있습니다.</p>
      </section>

      <div className={styles.copyGrid}>
        {applicationBlocks.map((block) => (
          <article className={styles.copyCard} key={block.title}>
            <div className={styles.cardHeader}>
              <div>
                <h3>{block.title}</h3>
                <p>{block.description}</p>
              </div>
            </div>
            <pre className={styles.copyBlock}>{block.body}</pre>
          </article>
        ))}
      </div>

      <section className={styles.sectionHeader}>
        <p className={styles.eyebrow}>CHECKLIST</p>
        <h2>신청 전후 체크리스트</h2>
        <p>실제 Production 신청 전에 이 목록을 기준으로 사이트 상태와 시연 흐름을 확인합니다.</p>
      </section>

      <div className={styles.checkGrid}>
        {checklistGroups.map((group) => (
          <article className={styles.checkCard} key={group.title}>
            <h3>{group.title}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <section className={styles.flowCard}>
        <div>
          <p className={styles.eyebrow}>REVIEW ROUTE</p>
          <h2>심사용 추천 동선</h2>
          <p>Riot 심사 또는 내부 검토용 계정을 만들 경우 아래 순서대로 확인하면 됩니다.</p>
        </div>
        <ol>
          <li><Link href="/login">로그인</Link> 후 <Link href="/me/riot">/me/riot</Link>에서 Riot 연동 화면 확인</li>
          <li><Link href="/players/1">/players/1</Link>과 <Link href="/players/1/riot">/players/1/riot</Link>에서 선수 카드 확인</li>
          <li><Link href="/admin/riot">/admin/riot</Link>에서 관리자 대시보드 확인</li>
          <li><Link href="/admin/riot/accounts">/admin/riot/accounts</Link>에서 계정 관리 흐름 확인</li>
          <li><Link href="/admin/riot/logs">/admin/riot/logs</Link>에서 API/연동 로그 확인</li>
          <li><Link href="/admin/riot/sync">/admin/riot/sync</Link>에서 단일·배치 동기화 제어 확인</li>
        </ol>
      </section>
    </main>
  );
}
