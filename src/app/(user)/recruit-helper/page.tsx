import styles from "./RecruitHelperPage.module.css";

export const dynamic = "force-static";

type MessageSide = "me" | "bot" | "system";

type ChatMessage = {
  side: MessageSide;
  name: string;
  text: string;
  time: string;
  status?: string;
};

type Scenario = {
  id: string;
  group: "전체" | "LOL-K" | "내전" | "구인생성" | "구인관리" | "무응답";
  title: string;
  room: string;
  description: string;
  commands: string[];
  status: string;
  tone: "guide" | "search" | "season" | "create" | "sync" | "reset" | "silent";
  messages: ChatMessage[];
  note?: string;
};

const scenarios: Scenario[] = [
  {
    id: "helper",
    group: "전체",
    title: "구인도우미 페이지 열기",
    room: "전체 사용 가능",
    description: "현재 사용 중인 카카오톡 명령어 전체 설명 페이지를 확인합니다.",
    commands: ["구인도우미", "/구인도우미", "구인매뉴얼", "명령어페이지"],
    status: "링크 안내 완료",
    tone: "guide",
    messages: [
      { side: "me", name: "사용자", text: "구인도우미", time: "오후 8:01" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "[K-LOL.GG 구인도우미]\n\n현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.\n\nhttps://k-lol-gg.vercel.app/recruit-helper\n\n구인현황 바로가기:\nhttps://k-lol-gg.vercel.app/recruit",
        time: "오후 8:01",
        status: "링크 안내 완료",
      },
    ],
  },
  {
    id: "help",
    group: "전체",
    title: "일반 도움말",
    room: "LOL - K / 전체 사용 가능",
    description: "LOL-K 기본 명령어만 확인합니다. 구인구직은 구인도움말로 분리했습니다.",
    commands: ["도움말", "/도움말", "명령어", "/명령어"],
    status: "도움말 출력",
    tone: "guide",
    messages: [
      { side: "me", name: "사용자", text: "도움말", time: "오후 8:02" },
      {
        side: "bot",
        name: "K-LOL 전적검색",
        text:
          "[K-LOL.GG 일반 도움말]\n\nLOL-K 기능\n- 내전현황 : 현재 시즌내전 신청 현황\n- AI공지 : 내전현황과 동일하게 처리\n- 내전참가 / 참가신청 : 참가 방법 안내\n- 전적 닉네임#태그 : 플레이어 전적 조회\n- 최근 닉네임#태그 : 최근 경기 조회\n- 랭킹 : 랭킹 조회\n\n구인구직 명령어는 구인도움말을 입력해주세요.\n\n참고\n- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.\n- 예) /내전현황, /전적 닉네임#태그, /구인도움말",
        time: "오후 8:02",
        status: "도움말 출력",
      },
    ],
  },

  {
    id: "recruit-help",
    group: "구인관리",
    title: "구인구직 도움말",
    room: "구인구직방 / 전체 사용 가능",
    description: "구인구직 파티 생성, 현황, 마감, 내전구인 명령어만 따로 확인합니다.",
    commands: ["구인도움말", "/구인도움말", "구인명령어", "/구인명령어"],
    status: "구인 도움말 출력",
    tone: "guide",
    messages: [
      { side: "me", name: "사용자", text: "/구인도움말", time: "오후 8:03" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "[K-LOL.GG 구인구직 도움말]\n\n파티 생성\n- 2인파티 / 3인파티 / 4인파티\n- 5인파티 / 8인파티 / 10인파티\n\n작성 규칙\n- 게임정보란에 게임 종류, 시작시간 등을 작성\n- 모집번호는 지우지 말고 그대로 사용\n\n구인구직 기능\n- 구인도우미 : 명령어 전체 설명 페이지\n- 구인현황 / 현황\n- 모집번호 + 쫑 또는 모집번호 + ㅉ\n- 구인마감 #번호\n\n내전 구인구직방 기능\n- 내전구인\n- 내전구인구직\n\n참고\n- 구인도움말도 /구인도움말로 사용 가능\n- 예) /5인파티, /구인현황, /구인마감 #12",
        time: "오후 8:03",
        status: "구인 도움말 출력",
      },
    ],
  },
  {
    id: "record",
    group: "LOL-K",
    title: "전적 조회",
    room: "LOL - K",
    description: "등록된 플레이어의 시즌 전적, 승률, MVP, KDA를 조회합니다.",
    commands: ["전적 닉네임#태그", "/전적 닉네임#태그"],
    status: "조회 완료",
    tone: "search",
    note: "실제 출력값은 사이트에 저장된 플레이어 기록에 따라 달라집니다.",
    messages: [
      { side: "me", name: "사용자", text: "전적 sax0ph0ne#99단굵묵", time: "오후 8:04" },
      {
        side: "bot",
        name: "K-LOL 전적검색",
        text:
          "[K-LOL.GG 전적]\n플레이어: sax0ph0ne#99단굵묵\n\n시즌 경기: 18전 10승 8패\n승률: 55.6%\nKDA: 3.42\nMVP: 4회\n\n최근 경기와 상세 기록은 사이트에서 확인 가능합니다.",
        time: "오후 8:04",
        status: "조회 완료",
      },
    ],
  },
  {
    id: "recent",
    group: "LOL-K",
    title: "최근 경기 조회",
    room: "LOL - K",
    description: "특정 플레이어의 최근 경기 요약을 확인합니다.",
    commands: ["최근 닉네임#태그", "/최근 닉네임#태그"],
    status: "조회 완료",
    tone: "search",
    messages: [
      { side: "me", name: "사용자", text: "최근 sax0ph0ne#99단굵묵", time: "오후 8:05" },
      {
        side: "bot",
        name: "K-LOL 전적검색",
        text:
          "[K-LOL.GG 최근 경기]\n플레이어: sax0ph0ne#99단굵묵\n\n1. 승리 / MID / 아리 / 7/2/8\n2. 패배 / ADC / 진 / 4/5/6\n3. 승리 / MID / 오리아나 / 5/1/11\n\n최근 경기 상세는 사이트에서 확인 가능합니다.",
        time: "오후 8:05",
        status: "조회 완료",
      },
    ],
  },
  {
    id: "ranking",
    group: "LOL-K",
    title: "랭킹 조회",
    room: "LOL - K",
    description: "현재 시즌 랭킹 요약을 카카오톡에서 확인합니다.",
    commands: ["랭킹", "/랭킹"],
    status: "랭킹 조회 완료",
    tone: "search",
    messages: [
      { side: "me", name: "사용자", text: "랭킹", time: "오후 8:06" },
      {
        side: "bot",
        name: "K-LOL 전적검색",
        text:
          "[K-LOL.GG 랭킹]\n\n승률 TOP 3\n1. 재현 66.7%\n2. 민서 61.5%\n3. 정민 58.8%\n\nMVP TOP 3\n1. 재현 7회\n2. 주현 5회\n3. 석민 4회\n\n참여 10회 이상 기준으로 집계됩니다.",
        time: "오후 8:06",
        status: "랭킹 조회 완료",
      },
    ],
  },
  {
    id: "participation-guide",
    group: "내전",
    title: "내전 참가 방법 안내",
    room: "LOL - K",
    description: "사이트에서 시즌내전 참가 신청하는 방법을 안내합니다.",
    commands: ["내전참가", "참가신청", "/내전참가", "/참가신청"],
    status: "안내 완료",
    tone: "season",
    messages: [
      { side: "me", name: "사용자", text: "내전참가", time: "오후 8:08" },
      {
        side: "bot",
        name: "K-LOL 전적검색",
        text:
          "[K-LOL.GG 내전 참가 방법 안내]\n오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다.\n\n1. K-LOL.GG 접속\nhttps://k-lol-gg.vercel.app\n2. 로그인\n3. 시즌내전 참가하기 클릭\n4. 주 포지션 / 부 포지션 선택\n5. 참가 신청 완료\n\n참가 신청 기준으로 팀 밸런스가 진행됩니다.\n신청하지 않은 인원은 팀 편성에서 누락될 수 있습니다.",
        time: "오후 8:08",
        status: "안내 완료",
      },
    ],
  },
  {
    id: "season-status",
    group: "내전",
    title: "시즌내전 현황 조회",
    room: "LOL - K",
    description: "현재 시즌내전 신청 인원과 포지션 현황을 확인합니다.",
    commands: ["내전현황", "시즌내전현황", "AI공지", "/내전현황"],
    status: "현황 조회 완료",
    tone: "season",
    messages: [
      { side: "me", name: "사용자", text: "내전현황", time: "오후 8:10" },
      {
        side: "bot",
        name: "K-LOL 전적검색",
        text:
          "[K-LOL.GG 내전 참가 안내]\n현재 참가자: 8명\n10명 기준 2명이 더 필요합니다.\n\n포지션 현황\nTOP 2명\nJUG 1명\nMID 2명\nADC 1명\nSUP 2명\n\n부족 포지션: 정글, 원딜\n참가 가능하신 분은 사이트에서 신청 부탁드립니다.",
        time: "오후 8:10",
        status: "현황 조회 완료",
      },
    ],
  },
  {
    id: "season-template",
    group: "내전",
    title: "내전 구인 양식 생성",
    room: "K롤방 구인구직방",
    description: "시즌내전 참가 신청 양식을 카카오톡방에 생성합니다.",
    commands: ["내전구인", "내전구인구직", "/내전구인"],
    status: "양식 생성 완료",
    tone: "create",
    messages: [
      { side: "me", name: "사용자", text: "내전구인", time: "오후 8:12" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "📢 협곡내전하실분\n 》2026-05-18 21시\n\n*참가 신청 양식*\n이름/현티어/최고티어/주,부라인\nEX) 1.지후/P/E/AD,MD\n\n1.\n2.\n3.\n4.\n5.\n6.\n7.\n8.\n9.\n10.",
        time: "오후 8:12",
        status: "양식 생성 완료",
      },
    ],
  },
  {
    id: "season-save",
    group: "내전",
    title: "내전 참가 자동 저장",
    room: "K롤방 구인구직방",
    description: "참가 신청 양식을 작성해 보내면 사이트 신청 현황에 저장합니다.",
    commands: ["참가 신청 양식 작성 후 전송"],
    status: "저장 완료",
    tone: "sync",
    note: "이름/현티어/최고티어/주,부라인 형식과 / 구분자가 필요합니다.",
    messages: [
      {
        side: "me",
        name: "사용자",
        text:
          "📢 협곡내전하실분\n 》2026-05-18 21시\n\n*참가 신청 양식*\n이름/현티어/최고티어/주,부라인\nEX) 1.지후/P/E/AD,MD\n\n1.재현/P/E/MID,ADC\n2.민서/E/D/ADC,SUP\n3.정민/G/P/TOP,JUG",
        time: "오후 8:14",
      },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[K-LOL.GG 구인구직방 참가 자동 등록 완료]\n내전 시작 10분전에 디스코드 내전 대기방으로 와주세요.",
        time: "오후 8:14",
        status: "저장 완료",
      },
    ],
  },
  {
    id: "party-create",
    group: "구인생성",
    title: "파티 구인 생성",
    room: "K롤방 구인구직방",
    description: "인원수 기준 파티 구인 글을 생성합니다.",
    commands: ["2인파티", "3인파티", "4인파티", "5인파티", "8인파티", "10인파티"],
    status: "구인 생성 완료",
    tone: "create",
    messages: [
      { side: "me", name: "사용자", text: "5인파티", time: "오후 8:16" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "[K-LOL.GG 구인구직 등록 완료]\n같이 할사람~\n\n아래 양식의 모집번호는 유지해서 작성해주세요.\n\n📢 5인 파티 구인\n모집번호: #12\n\n》게임정보 :\n\n1.\n2.\n3.\n4.\n5.\n\n참여해주실 분은 태그해주세요.\n*상호배려와 존중 부탁드립니다.",
        time: "오후 8:16",
        status: "구인 생성 완료",
      },
    ],
  },
  {
    id: "lane-create",
    group: "구인생성",
    title: "협곡 라인 구인 생성",
    room: "K롤방 구인구직방",
    description: "TOP/JUG/MID/ADC/SUP 라인별로 5인 협곡 파티를 모집합니다.",
    commands: ["5인협곡파티", "/5인협곡파티"],
    status: "구인 생성 완료",
    tone: "create",
    messages: [
      { side: "me", name: "사용자", text: "5인협곡파티", time: "오후 8:18" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "[K-LOL.GG 구인구직 등록 완료]\n같이 할사람~\n\n아래 양식의 모집번호는 유지해서 작성해주세요.\n\n📢 5인 협곡 파티 구인\n모집번호: #13\n\n》게임정보 :\n\nTOP.\nJUG.\nMID.\nADC.\nSUP.\n\n마지막 참가자가 전체 태그 해주세요.\n*상호배려와 존중 부탁드립니다.",
        time: "오후 8:18",
        status: "구인 생성 완료",
      },
    ],
  },
  {
    id: "legacy-create",
    group: "구인생성",
    title: "기존 구인 생성",
    room: "K롤방 구인구직방",
    description: "솔랭, 자랭, 일반, 칼바람, 롤체 등 분류형 구인을 생성합니다.",
    commands: ["솔랭구인", "자랭구인", "일반구인", "칼바람구인", "증바람구인", "기타게임구인", "롤체일반구인", "롤체랭크구인", "더블업구인"],
    status: "구인 생성 완료",
    tone: "create",
    messages: [
      { side: "me", name: "사용자", text: "자랭구인", time: "오후 8:20" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "[K-LOL.GG 구인구직 등록 완료]\n같이 할사람~\n\n아래 양식의 모집번호는 유지해서 작성해주세요.\n\n📢 자랭 하실분!\n모집번호: #14\n\n》게임정보 :\n\nTOP.\nJUG.\nMID.\nADC.\nSUP.\n\n마지막 참가자가 전체 태그 해주세요.\n*상호배려와 존중 부탁드립니다.",
        time: "오후 8:20",
        status: "구인 생성 완료",
      },
    ],
  },
  {
    id: "sync",
    group: "구인관리",
    title: "구인 참여 / 수정 저장",
    room: "K롤방 구인구직방",
    description: "모집번호가 포함된 구인 양식을 수정해 다시 보내면 구인현황에 저장합니다.",
    commands: ["모집번호가 있는 구인 양식 전체 전송"],
    status: "저장 완료",
    tone: "sync",
    note: "모집번호를 지우면 봇이 처리하지 않습니다.",
    messages: [
      {
        side: "me",
        name: "사용자",
        text:
          "📢 5인 파티 구인\n모집번호: #12\n\n》게임정보 : 자랭 5인큐 9시 출발\n\n1. 재현\n2. 민서\n3. 주현\n4.\n5.",
        time: "오후 8:22",
      },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "[K-LOL.GG 구인구직 현황 반영 완료]\n모집번호: #12\n상태: 구인중\n현재 인원: 3/5\n\n현황 보기:\nhttps://k-lol-gg.vercel.app/recruit",
        time: "오후 8:22",
        status: "저장 완료",
      },
    ],
  },
  {
    id: "status",
    group: "구인관리",
    title: "구인현황 확인",
    room: "K롤방 구인구직방",
    description: "현재 진행 중인 구인 목록을 카카오톡에서 확인합니다.",
    commands: ["구인현황", "구인구직현황", "현재구인현황", "현재구인구직현황", "현황"],
    status: "현황 조회 완료",
    tone: "search",
    messages: [
      { side: "me", name: "사용자", text: "구인현황", time: "오후 8:24" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text:
          "[K-LOL.GG 구인구직 현황]\n\n5인 파티 구인 진행중 · 구인중\n》게임정보 : 자랭 5인큐 9시 출발\n모집번호: #12\n현재 인원: 3/5\n\n1. 재현\n2. 민서\n3. 주현\n4.\n5.\n\n현황 보기:\nhttps://k-lol-gg.vercel.app/recruit",
        time: "오후 8:24",
        status: "현황 조회 완료",
      },
    ],
  },
  {
    id: "close",
    group: "구인관리",
    title: "구인 마감",
    room: "K롤방 구인구직방",
    description: "진행 중인 구인을 마감 처리합니다.",
    commands: ["12 쫑", "12 ㅉ", "구인마감 #12", "#12 쫑"],
    status: "마감 완료",
    tone: "reset",
    messages: [
      { side: "me", name: "사용자", text: "12 쫑", time: "오후 8:26" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[K-LOL.GG 구인구직 마감 완료]\n모집번호: #12\n상태: 마감\n\n구인현황에서 제외됩니다.",
        time: "오후 8:26",
        status: "마감 완료",
      },
    ],
  },
  {
    id: "duplicate-reset",
    group: "구인관리",
    title: "신청 인식 초기화",
    room: "K롤방 구인구직방",
    description: "같은 신청글 또는 같은 구인 양식을 다시 처리할 수 있게 중복 인식값을 초기화합니다.",
    commands: ["신청초기화"],
    status: "초기화 완료",
    tone: "reset",
    messages: [
      { side: "me", name: "관리자", text: "신청초기화", time: "오후 8:30" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[신청 인식 초기화 완료]\n같은 신청글과 구인구직 양식을 다시 처리할 수 있습니다.",
        time: "오후 8:30",
        status: "초기화 완료",
      },
    ],
  },
  {
    id: "today-reset",
    group: "구인관리",
    title: "오늘 내전 신청 초기화",
    room: "K롤방 구인구직방",
    description: "오늘 날짜의 시즌내전 참가 신청 현황을 초기화합니다.",
    commands: ["오늘내전초기화", "/오늘내전초기화"],
    status: "초기화 완료",
    tone: "reset",
    messages: [
      { side: "me", name: "관리자", text: "오늘내전초기화", time: "오후 8:32" },
      {
        side: "bot",
        name: "K-LOL 구인구직 도우미",
        text: "[오늘 내전 신청 초기화 완료]\n오늘 등록된 시즌내전 참가 신청을 초기화했습니다.",
        time: "오후 8:32",
        status: "초기화 완료",
      },
    ],
  },
  {
    id: "silent-no-number",
    group: "무응답",
    title: "모집번호 없는 양식",
    room: "K롤방 구인구직방",
    description: "모집번호가 없는 구인 양식은 기존 구인과 연결할 수 없어 처리하지 않습니다.",
    commands: ["모집번호 없는 구인 양식"],
    status: "무응답 처리",
    tone: "silent",
    note: "일부러 답장하지 않는 설정입니다. 기존 구인 수정은 모집번호가 있어야 합니다.",
    messages: [
      {
        side: "me",
        name: "사용자",
        text: "📢 자랭 하실분!\n》게임 시작 시간\nTOP.\nJUG.\nMID.\nADC.\nSUP.",
        time: "오후 8:34",
      },
      {
        side: "system",
        name: "처리 결과",
        text:
          "봇 응답 없음\n\n사유: 모집번호가 없어 기존 구인 수정인지 신규 양식인지 판단하지 않습니다.\n구인을 수정하려면 반드시 모집번호: #번호를 유지해야 합니다.",
        time: "오후 8:34",
        status: "무응답 처리",
      },
    ],
  },
];

const groups = ["전체", "LOL-K", "내전", "구인생성", "구인관리", "무응답"] as const;

const commandChips = [
  "구인도우미",
  "도움말",
  "전적 닉네임#태그",
  "최근 닉네임#태그",
  "랭킹",
  "내전참가",
  "내전현황",
  "내전구인",
  "5인파티",
  "5인협곡파티",
  "자랭구인",
  "구인현황",
  "12 쫑",
  "신청초기화",
];

function ChatMessageView({ message }: { message: ChatMessage }) {
  const avatarText = message.side === "me" ? "나" : message.side === "bot" ? "봇" : "!";

  return (
    <div className={`${styles.chatRow} ${styles[message.side]}`}>
      <div className={styles.avatar} aria-hidden="true">{avatarText}</div>
      <div className={styles.chatContent}>
        <div className={styles.chatMeta}>
          <strong>{message.name}</strong>
          <span>{message.time}</span>
        </div>
        <pre className={styles.chatBubble}>{message.text}</pre>
        {message.status ? <span className={styles.doneBadge}>{message.status}</span> : null}
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
          <h3>{index + 1}. {scenario.title}</h3>
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
        <div className={styles.statusBar}>
          <span>8:34</span>
          <span>LTE 100%</span>
        </div>
        <div className={styles.kakaoHeader}>
          <span className={styles.backIcon}>‹</span>
          <div>
            <strong>{scenario.room}</strong>
            <small>카카오톡 출력 예시</small>
          </div>
          <span className={styles.menuIcon}>☰</span>
        </div>
        <div className={styles.dateDivider}>2026년 5월 18일 월요일</div>
        <div className={styles.chatScreen}>
          {scenario.messages.map((message, messageIndex) => (
            <ChatMessageView key={`${scenario.id}-${messageIndex}`} message={message} />
          ))}
        </div>
      </div>
    </article>
  );
}

export default function RecruitHelperPage() {
  const scenarioCountByGroup = groups.map((group) => ({
    group,
    count: scenarios.filter((scenario) => scenario.group === group).length,
  }));

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroPanel}>
          <p className={styles.eyebrow}>K-LOL.GG KAKAO COMMAND CENTER</p>
          <h1>카카오톡 명령어 실제 출력 안내</h1>
          <p className={styles.heroText}>
            롤방에서 입력하는 명령어와 봇이 반환하는 출력값을 카카오톡 대화 화면처럼 정리했습니다.
            구인 생성, 저장 완료, 현황 조회, 초기화, 무응답 처리까지 한 페이지에서 확인할 수 있습니다.
          </p>
          <div className={styles.heroActions}>
            <a href="#scenario-list">출력 예시 보기</a>
            <a href="/recruit">구인현황 바로가기</a>
          </div>
        </div>
      </section>

      <section className={styles.ruleCard}>
        <strong>핵심 규칙</strong>
        <p>
          구인 참여·수정·삭제는 모집번호가 기준입니다. 기존 구인 양식을 다시 보낼 때는 반드시 <b>모집번호: #번호</b>를 유지해야 합니다.
          모집번호가 없는 양식은 기존 글과 연결할 수 없어 봇이 답장하지 않도록 처리됩니다.
        </p>
      </section>

      <section className={styles.quickGrid} aria-label="명령어 분류 요약">
        {scenarioCountByGroup.map((item) => (
          <a key={item.group} href={`#group-${item.group}`} className={styles.quickCard}>
            <span>{item.group}</span>
            <strong>{item.count}개 예시</strong>
          </a>
        ))}
      </section>

      <section className={styles.commandStrip} aria-label="주요 명령어">
        {commandChips.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </section>

      <section id="scenario-list" className={styles.groupList}>
        {groups.map((group) => {
          const groupItems = scenarios.filter((scenario) => scenario.group === group);
          return (
            <section key={group} id={`group-${group}`} className={styles.groupSection}>
              <div className={styles.groupTitle}>
                <span>{group}</span>
                <h2>{group} 명령어</h2>
                <p>{groupItems.length}개의 실제 출력 예시</p>
              </div>
              <div className={styles.scenarioGrid}>
                {groupItems.map((scenario, index) => (
                  <ScenarioCard key={scenario.id} scenario={scenario} index={index} />
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}
