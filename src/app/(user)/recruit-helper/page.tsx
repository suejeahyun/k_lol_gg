import type { ReactNode } from "react";
import styles from "./RecruitHelperPage.module.css";

export const dynamic = "force-static";

type RecruitExampleProps = {
  title: string;
  recruitNo?: number;
  status?: "구인중" | "마감" | "삭제됨";
  current?: number;
  max?: number;
  gameInfo?: string;
  members?: string[];
  highlight?: string;
  mode?: "normal" | "yellow";
};

type HelperStep = {
  step: string;
  title: string;
  icon: string;
  descriptions: string[];
  examples: ReactNode[];
};

function RecruitExample({
  title,
  recruitNo = 12,
  status = "구인중",
  current = 1,
  max = 5,
  gameInfo = "랭크 듀오 같이 하실 분",
  members = ["K-LOL", "", "", "", ""],
  highlight,
  mode = "normal",
}: RecruitExampleProps) {
  return (
    <div className={styles.mockPhone}>
      <div className={styles.mockHeader}>
        <span>K-LOL 구인구직 도우미</span>
        <b>{status}</b>
      </div>

      <div className={mode === "yellow" ? styles.mockBubbleInput : styles.mockBubble}>
        <strong>[K-LOL.GG 구인구직 등록 완료]</strong>
        <p>같이 할사람~</p>

        <div className={styles.mockNotice}>아래 양식의 모집번호는 유지해서 작성해주세요.</div>

        <h3>{title}</h3>

        <dl>
          <div>
            <dt>모집번호</dt>
            <dd>#{recruitNo}</dd>
          </div>
          <div>
            <dt>게임정보</dt>
            <dd>{gameInfo}</dd>
          </div>
          <div>
            <dt>현재 인원</dt>
            <dd>
              {current}/{max}
            </dd>
          </div>
        </dl>

        {highlight ? <div className={styles.highlight}>{highlight}</div> : null}

        <ol className={styles.memberList}>
          {Array.from({ length: max }).map((_, index) => (
            <li key={index}>
              <span>{index + 1}.</span>
              <em>{members[index] || ""}</em>
            </li>
          ))}
        </ol>

        <div className={styles.mockFooter}>
          현황 보기:
          <br />
          https://k-lol-gg.vercel.app/recruit
        </div>
      </div>
    </div>
  );
}

function LineRecruitExample({
  highlight,
  members = {
    TOP: "",
    JUG: "",
    MID: "",
    ADC: "",
    SUP: "",
  },
}: {
  highlight?: string;
  members?: Record<"TOP" | "JUG" | "MID" | "ADC" | "SUP", string>;
}) {
  return (
    <div className={styles.mockPhone}>
      <div className={styles.mockHeader}>
        <span>K-LOL 구인구직 도우미</span>
        <b>구인중</b>
      </div>
      <div className={styles.mockBubbleInput}>
        <strong>[K-LOL.GG 구인구직 등록 완료]</strong>
        <p>협곡 5인 파티를 모집합니다.</p>
        <div className={styles.mockNotice}>모집번호는 수정하지 말고 유지해주세요.</div>
        <h3>📢 5인 협곡 파티 구인</h3>
        <dl>
          <div>
            <dt>모집번호</dt>
            <dd>#12</dd>
          </div>
          <div>
            <dt>게임정보</dt>
            <dd>자랭 5인큐 12시 시작</dd>
          </div>
        </dl>
        {highlight ? <div className={styles.highlight}>{highlight}</div> : null}
        <div className={styles.lineList}>
          {(["TOP", "JUG", "MID", "ADC", "SUP"] as const).map((position) => (
            <div key={position}>
              <span>{position}.</span>
              <em>{members[position]}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommandBox({ command, description }: { command: string; description: string }) {
  return (
    <div className={styles.commandBox}>
      <code>{command}</code>
      <p>{description}</p>
    </div>
  );
}

const steps: HelperStep[] = [
  {
    step: "STEP 01",
    title: "구인 글 작성",
    icon: "✎",
    descriptions: [
      "인원수에 맞는 구인 양식을 선택합니다.",
      "2인파티 / 5인파티 / 8인파티 / 10인파티 중 필요한 양식을 사용합니다.",
      "게임정보와 참가자 이름을 입력한 뒤 전송합니다.",
      "구인현황에서 정상 등록 여부를 확인합니다.",
    ],
    examples: [
      <CommandBox key="command-write" command="5인파티" description="5인 파티 구인 양식을 불러옵니다." />,
      <RecruitExample
        key="write-example"
        title="📢 5인 파티 구인"
        recruitNo={12}
        current={1}
        max={5}
        gameInfo="자랭 5인큐 12시 시작"
        members={["K-LOL", "", "", "", ""]}
        highlight="양식을 복사한 뒤 빈 칸에 정보를 입력합니다."
        mode="yellow"
      />,
    ],
  },
  {
    step: "STEP 02",
    title: "참여하기",
    icon: "＋",
    descriptions: [
      "구인현황에 올라온 양식을 복사합니다.",
      "빈 번호에 본인 이름을 작성합니다.",
      "수정한 양식을 다시 카카오톡방에 전송합니다.",
      "구인현황에서 최종 등록 상태를 확인합니다.",
    ],
    examples: [
      <RecruitExample
        key="join-before"
        title="📢 5인 파티 구인"
        recruitNo={12}
        current={1}
        max={5}
        gameInfo="자랭 5인큐 12시 시작"
        members={["K-LOL", "", "", "", ""]}
        highlight="2번 칸에 본인 이름을 추가합니다."
        mode="yellow"
      />,
      <RecruitExample
        key="join-after"
        title="📢 5인 파티 구인"
        recruitNo={12}
        current={2}
        max={5}
        gameInfo="자랭 5인큐 12시 시작"
        members={["K-LOL", "재현", "", "", ""]}
        highlight="참여 후 현재 인원이 2/5로 변경됩니다."
      />,
    ],
  },
  {
    step: "STEP 03",
    title: "이름 지우기",
    icon: "−",
    descriptions: [
      "구인현황 양식을 복사합니다.",
      "본인 이름만 삭제합니다.",
      "수정된 양식을 다시 전송합니다.",
      "구인현황에서 이름이 제거되었는지 확인합니다.",
    ],
    examples: [
      <RecruitExample
        key="remove-before"
        title="📢 5인 파티 구인"
        recruitNo={12}
        current={2}
        max={5}
        gameInfo="자랭 5인큐 12시 시작"
        members={["K-LOL", "재현", "", "", ""]}
        highlight="참여 취소 시 본인 이름만 지웁니다."
        mode="yellow"
      />,
      <RecruitExample
        key="remove-after"
        title="📢 5인 파티 구인"
        recruitNo={12}
        current={1}
        max={5}
        gameInfo="자랭 5인큐 12시 시작"
        members={["K-LOL", "", "", "", ""]}
        highlight="이름 삭제 후 현재 인원이 다시 1/5가 됩니다."
      />,
    ],
  },
  {
    step: "STEP 04",
    title: "구인 글 지우기",
    icon: "⌫",
    descriptions: [
      "삭제할 모집번호를 확인합니다.",
      "모집번호와 종료 명령어를 함께 입력합니다.",
      "예시: 12 쫑 또는 12 ㅉ",
      "구인현황에서 해당 글이 삭제되었는지 확인합니다.",
    ],
    examples: [
      <CommandBox key="delete-command-1" command="12 쫑" description="12번 모집글을 종료 처리합니다." />,
      <CommandBox key="delete-command-2" command="12 ㅉ" description="짧은 마감 명령어로도 처리할 수 있습니다." />,
      <RecruitExample
        key="delete-after"
        title="📢 5인 파티 구인"
        recruitNo={12}
        status="삭제됨"
        current={0}
        max={5}
        gameInfo="삭제된 구인입니다."
        members={["", "", "", "", ""]}
        highlight="구인현황에서 삭제 여부를 확인합니다."
      />,
    ],
  },
];

export default function RecruitHelperPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p>K-LOL.GG</p>
        <h1>K-LOL HELPER</h1>
        <span>구인구직 도우미 웹페이지 종합 이용 매뉴얼</span>
      </section>

      <section className={styles.alert}>
        <strong>핵심 규칙</strong>
        <p>
          기존 구인을 수정하거나 참여자를 변경할 때는 반드시 모집번호를 유지해야 합니다. 모집번호가 없으면 기존
          구인을 찾을 수 없어 반영되지 않을 수 있습니다.
        </p>
      </section>

      <section className={styles.stepGrid}>
        {steps.map((step) => (
          <article key={step.step} className={styles.stepCard}>
            <div className={styles.stepBadge}>{step.step}</div>

            <h2>
              <span>{step.icon}</span>
              {step.title}
            </h2>

            <ol className={styles.description}>
              {step.descriptions.map((description) => (
                <li key={description}>{description}</li>
              ))}
            </ol>

            <div className={styles.exampleList}>{step.examples}</div>
          </article>
        ))}
      </section>

      <section className={styles.lineGuide}>
        <div>
          <p className={styles.sectionKicker}>LINE PARTY</p>
          <h2>5인협곡파티는 라인별로 작성</h2>
          <p>
            5인협곡파티는 번호가 아니라 TOP/JUG/MID/ADC/SUP 라인 칸을 기준으로 등록됩니다. 라인을 바꿀 때도
            모집번호는 유지해야 합니다.
          </p>
        </div>
        <LineRecruitExample
          highlight="라인별 이름을 입력하면 구인현황에 같은 라인 기준으로 반영됩니다."
          members={{ TOP: "재현", JUG: "", MID: "", ADC: "", SUP: "" }}
        />
      </section>

      <section className={styles.summary}>
        <h2>명령어 요약</h2>

        <div className={styles.summaryGrid}>
          <CommandBox command="구인도우미" description="현재 안내 페이지 확인" />
          <CommandBox command="구인현황" description="진행 중인 구인 목록 확인" />
          <CommandBox command="2인파티" description="2인 파티 구인 양식 생성" />
          <CommandBox command="5인파티" description="5인 파티 구인 양식 생성" />
          <CommandBox command="5인협곡파티" description="라인별 5인 파티 구인 양식 생성" />
          <CommandBox command="롤체랭크구인" description="롤체 랭크 3인 구인 양식 생성" />
          <CommandBox command="12 쫑" description="12번 구인 마감 처리" />
          <CommandBox command="모집번호초기화" description="다음 구인을 #1부터 시작" />
        </div>
      </section>
    </main>
  );
}
