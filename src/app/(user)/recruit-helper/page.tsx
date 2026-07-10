import styles from "./RecruitHelperPage.module.css";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

type MessageSide = "me" | "bot" | "system";

type ChatMessage = {
  side: MessageSide;
  name: string;
  text: string;
  time: string;
  status?: string;
};

type ScenarioGroup =
  | "구인관련 명령어"
  | "내전 관련"
  | "K-LOL 관련"
  | "무응답";

type Scenario = {
  id: string;
  group: ScenarioGroup;
  title: string;
  room: string;
  description: string;
  commands: string[];
  status: string;
  tone: "guide" | "create" | "sync" | "search" | "reset" | "silent";
  messages: ChatMessage[];
  note?: string;
};

type CommandGroup = {
  title: string;
  description: string;
  commands: string[];
};

const commandGroups: CommandGroup[] = [
  {
    title: "전체/도움말",
    description: "사용방법과 현황 페이지를 다시 확인합니다.",
    commands: ["구인도우미", "/구인도우미", "구인매뉴얼"],
  },
  {
    title: "구인관련",
    description: "파티 생성, 현황 확인, 마감에 사용합니다.",
    commands: ["5인파티", "구인현황", "구인상세 12", "12ㅉ"],
  },
  {
    title: "내전 관련",
    description: "오늘 내전 상태와 참가 신청을 확인합니다.",
    commands: ["내전현황", "내전참가", "참가신청", "내전구인"],
  },
  {
    title: "K-LOL 관련",
    description: "전적, 최근 경기, 랭킹, 공지를 조회합니다.",
    commands: ["전적 닉네임#태그", "최근 닉네임#태그", "랭킹", "AI공지"],
  },
  {
    title: "무응답 기준",
    description: "봇이 처리하지 않는 입력입니다.",
    commands: ["모집번호 없는 수정", "일반 대화", "잘못된 양식"],
  },
];

const scenarios: Scenario[] = [
  {
    id: "party-create",
    group: "구인관련 명령어",
    title: "5인 파티 구인 생성",
    room: "K롤방 구인구직방",
    description: "가장 많이 쓰는 5인 파티 기준 예시입니다.",
    commands: ["5인파티", "/5인파티", "5인구인"],
    status: "구인 생성",
    tone: "create",
    messages: [
      { side: "me", name: "사용자", text: "5인파티", time: "오후 8:10" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[K-LOL.GG 구인구직 등록 완료]\n\n📢 5인 파티 구인\n모집번호: #12\n\n》게임정보 :\n\n1.\n2.\n3.\n4.\n5.",
        time: "오후 8:10",
        status: "구인 생성",
      },
    ],
  },
  {
    id: "party-save",
    group: "구인관련 명령어",
    title: "참여 / 수정 저장",
    room: "K롤방 구인구직방",
    description: "이름을 추가한 뒤 양식 전체를 다시 보내면 저장됩니다.",
    commands: ["모집번호 포함 양식 전체 전송"],
    status: "현황 반영",
    tone: "sync",
    note: "기존 구인을 수정할 때는 모집번호: #번호를 반드시 유지해야 합니다.",
    messages: [
      {
        side: "me",
        name: "사용자",
        text: "📢 5인 파티 구인\n모집번호: #12\n\n》게임정보 : 자랭 5인큐 9시 출발\n\n1. 재현\n2. 민서\n3. 주현\n4.\n5.",
        time: "오후 8:12",
      },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[K-LOL.GG 구인구직 현황 반영 완료]\n모집번호: #12\n상태: 구인중\n현재 인원: 3/5",
        time: "오후 8:12",
        status: "현황 반영",
      },
    ],
  },
  {
    id: "status",
    group: "구인관련 명령어",
    title: "구인현황 확인",
    room: "K롤방 구인구직방",
    description: "현재 진행 중인 구인을 확인합니다.",
    commands: ["구인현황", "/구인현황", "현황"],
    status: "현황 조회",
    tone: "search",
    messages: [
      { side: "me", name: "사용자", text: "구인현황", time: "오후 8:15" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[K-LOL.GG 구인구직 현황]\n\n[구인중]\n#12 · 5인 파티 · 3/5\n게임정보: 자랭 5인큐 9시 출발\n참여: 재현, 민서, 주현\n\n상세보기: 구인상세 12",
        time: "오후 8:15",
        status: "현황 조회",
      },
    ],
  },
  {
    id: "close",
    group: "구인관련 명령어",
    title: "구인 마감",
    room: "K롤방 구인구직방",
    description: "모집이 끝났거나 파티가 시작되면 마감 처리합니다.",
    commands: ["12ㅉ", "#12ㅉ"],
    status: "마감 완료",
    tone: "reset",
    messages: [
      { side: "me", name: "사용자", text: "12ㅉ", time: "오후 8:20" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[K-LOL.GG 구인구직 마감 완료]\n모집번호: #12\n상태: 마감\n\n구인현황에서 제외됩니다.",
        time: "오후 8:20",
        status: "마감 완료",
      },
    ],
  },
  {
    id: "match-status",
    group: "내전 관련",
    title: "내전현황 확인",
    room: "K롤방 구인구직방",
    description: "오늘 내전 모집 상태를 확인합니다.",
    commands: ["내전현황"],
    status: "내전 조회",
    tone: "search",
    messages: [
      { side: "me", name: "사용자", text: "내전현황", time: "오후 8:30" },
      {
        side: "bot",
        name: "K-LOL 내전 도우미",
        text: "[K-LOL.GG 내전현황]\n오늘 내전 모집 현황을 확인합니다.\n\n참가 신청: 내전참가",
        time: "오후 8:30",
        status: "내전 조회",
      },
    ],
  },
  {
    id: "match-join",
    group: "내전 관련",
    title: "내전 참가 신청",
    room: "K롤방 구인구직방",
    description: "오늘 내전에 참가 의사를 남길 때 사용합니다.",
    commands: ["내전참가", "참가신청"],
    status: "참가 접수",
    tone: "sync",
    messages: [
      { side: "me", name: "사용자", text: "내전참가", time: "오후 8:32" },
      {
        side: "bot",
        name: "K-LOL 내전 도우미",
        text: "[K-LOL.GG 내전 참가 신청 완료]\n오늘 내전 참가 신청이 접수되었습니다.",
        time: "오후 8:32",
        status: "참가 접수",
      },
    ],
  },
  {
    id: "record",
    group: "K-LOL 관련",
    title: "전적 조회",
    room: "전체 사용 가능",
    description: "플레이어 전적을 닉네임#태그 기준으로 조회합니다.",
    commands: ["전적 닉네임#태그", "최근 닉네임#태그"],
    status: "전적 조회",
    tone: "search",
    messages: [
      { side: "me", name: "사용자", text: "전적 Waka Boom#kr1", time: "오후 8:40" },
      {
        side: "bot",
        name: "K-LOL.GG",
        text: "[K-LOL.GG 전적 조회]\nWaka Boom#kr1 플레이어 기록을 확인합니다.",
        time: "오후 8:40",
        status: "전적 조회",
      },
    ],
  },
  {
    id: "ranking",
    group: "K-LOL 관련",
    title: "랭킹 / 공지 확인",
    room: "전체 사용 가능",
    description: "K-LOL 랭킹과 공지를 확인합니다.",
    commands: ["랭킹", "AI공지"],
    status: "정보 조회",
    tone: "guide",
    messages: [
      { side: "me", name: "사용자", text: "랭킹", time: "오후 8:42" },
      {
        side: "bot",
        name: "K-LOL.GG",
        text: "[K-LOL.GG 랭킹]\n현재 시즌 주요 랭킹을 확인합니다.",
        time: "오후 8:42",
        status: "정보 조회",
      },
    ],
  },
  {
    id: "silent-no-number",
    group: "무응답",
    title: "모집번호 없는 구인 수정",
    room: "K롤방 구인구직방",
    description: "모집번호가 없으면 기존 구인 수정으로 처리하지 않습니다.",
    commands: ["모집번호 없는 구인 양식"],
    status: "무응답",
    tone: "silent",
    note: "구인을 수정할 때는 반드시 모집번호: #번호를 유지해야 합니다.",
    messages: [
      {
        side: "me",
        name: "사용자",
        text: "📢 5인 파티 구인\n\n》게임정보 : 자랭\n\n1. 재현\n2. 민서\n3.\n4.\n5.",
        time: "오후 8:50",
      },
      {
        side: "system",
        name: "처리 결과",
        text: "봇 응답 없음\n\n사유: 모집번호가 없어 기존 구인과 연결할 수 없습니다.",
        time: "오후 8:50",
        status: "무응답",
      },
    ],
  },
];

const groups: ScenarioGroup[] = [
  "구인관련 명령어",
  "내전 관련",
  "K-LOL 관련",
  "무응답",
];

function ChatMessageView({ message }: { message: ChatMessage }) {
  const avatarText =
    message.side === "me" ? "나" : message.side === "bot" ? "봇" : "!";

  return (
    <div className={`${styles.chatRow} ${styles[message.side]}`}>
      <div className={styles.avatar} aria-hidden="true">
        {avatarText}
      </div>
      <div className={styles.chatContent}>
        <div className={styles.chatMeta}>
          <strong>{message.name}</strong>
          <span>{message.time}</span>
        </div>
        <pre className={styles.chatBubble}>{message.text}</pre>
        {message.status ? (
          <span className={styles.doneBadge}>{message.status}</span>
        ) : null}
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, index }: { scenario: Scenario; index: number }) {
  return (
    <article className={`${styles.scenarioCard} ${styles[scenario.tone]}`}>
      <div className={styles.scenarioTop}>
        <div>
          <span className={styles.groupBadge}>{scenario.group}</span>
          <h3>
            {index + 1}. {scenario.title}
          </h3>
          <p>{scenario.description}</p>
        </div>
        <span className={styles.resultBadge}>{scenario.status}</span>
      </div>

      <div className={styles.commandBar}>
        {scenario.commands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>

      {scenario.note ? <p className={styles.noteBox}>{scenario.note}</p> : null}

      <div className={styles.phoneShell}>
        <div className={styles.kakaoHeader}>
          <span className={styles.backIcon}>‹</span>
          <div>
            <strong>{scenario.room}</strong>
            <small>카카오톡 출력 예시</small>
          </div>
          <span className={styles.menuIcon}>☰</span>
        </div>
        <div className={styles.chatScreen}>
          {scenario.messages.map((message, messageIndex) => (
            <ChatMessageView
              key={`${scenario.id}-${messageIndex}`}
              message={message}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function CommandOverview() {
  return (
    <section id="commands" className={styles.overviewSection}>
      <div className={styles.groupTitle}>
        <span>1</span>
        <h2>전체 명령어</h2>
        <p>먼저 전체 목록을 보고, 아래에서 필요한 예시만 확인하세요.</p>
      </div>

      <div className={styles.commandOverviewGrid}>
        {commandGroups.map((group) => (
          <article key={group.title} className={styles.commandOverviewCard}>
            <strong>{group.title}</strong>
            <p>{group.description}</p>
            <div className={styles.commandList}>
              {group.commands.map((command) => (
                <code key={command}>{command}</code>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function RecruitHelperPage() {
  const siteSettings = await getSiteSettings();

  return (
    <PremiumFeatureGate feature="kakao" settings={siteSettings}>
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroPanel}>
          <p className={styles.eyebrow}>K-LOL.GG KAKAO COMMAND GUIDE</p>
          <h1>카카오톡 명령어 사용방법</h1>
          <p className={styles.heroText}>
            전체 명령어를 먼저 확인하고, 아래 예시에서 실제 카카오톡 응답을
            확인할 수 있습니다. 파티 구인은 <b>5인 파티</b> 기준으로 정리했습니다.
          </p>
          <div className={styles.heroActions}>
            <a href="#commands">전체 명령어</a>
            <a href="/recruit">구인현황 바로가기</a>
          </div>
        </div>
      </section>

      <section className={styles.ruleCard}>
        <strong>핵심 규칙</strong>
        <p>
          구인 참여와 수정은 <b>모집번호</b>로 구분합니다. 기존 구인을 수정할
          때는 반드시 <b>모집번호: #번호</b>를 유지해서 다시 보내주세요.
        </p>
      </section>

      <section id="examples" className={styles.groupList}>
        <CommandOverview />

        {groups.map((group, groupIndex) => {
          const groupItems = scenarios.filter(
            (scenario) => scenario.group === group,
          );

          return (
            <section
              key={group}
              id={`group-${group}`}
              className={styles.groupSection}
            >
              <div className={styles.groupTitle}>
                <span>{groupIndex + 2}</span>
                <h2>{group}</h2>
                <p>{groupItems.length}개 예시</p>
              </div>
              <div className={styles.scenarioGrid}>
                {groupItems.map((scenario, index) => (
                  <ScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    index={index}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </main>
    </PremiumFeatureGate>
  );
}
