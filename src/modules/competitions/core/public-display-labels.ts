const competitionStatusLabels: Record<string, string> = {
  PLANNED: "준비 중", RECRUITING: "모집 중", TEAM_BUILDING: "팀 편성", AUCTION: "경매 중", PRELIMINARY: "예선", IN_PROGRESS: "진행 중", TOURNAMENT: "본선", COMPLETED: "완료", CANCELLED: "취소", PUBLISHED: "결과 공개",
};

const eventStatusLabels: Record<string, string> = { ...competitionStatusLabels, RECRUITING: "참가 모집", TEAM_BUILDING: "팀 편성" };
const destructionStatusLabels: Record<string, string> = { ...competitionStatusLabels, RECRUITING: "참가 모집", TEAM_BUILDING: "주장 선정" };

const competitionFormatLabels: Record<string, string> = {
  POSITION: "포지션 드래프트", POSITIONAL: "포지션 드래프트", ARAM: "칼바람",
};

const preliminaryFormatLabels: Record<string, string> = {
  FULL_ROUND_ROBIN_BO3: "전체 풀리그", FULL_ROUND_ROBIN_BO1: "전체 풀리그", GROUP_ROUND_ROBIN_BO3: "조별 풀리그", GROUP_ROUND_ROBIN_BO1: "조별 풀리그", SWISS_ROUND_BO3: "스위스 라운드", SWISS_ROUND_BO1: "스위스 라운드", RANDOM_ROUNDS_BO3: "랜덤 라운드", RANDOM_ROUNDS_BO1: "랜덤 라운드",
};

const participationStatusLabels: Record<string, string> = { APPLIED: "신청", CONFIRMED: "참가 확정", RESERVE: "예비" };
const riotLinkMethodLabels: Record<string, string> = { DIRECT: "Riot ID 직접 연결", RSO: "Riot 계정 확인" };
const riotLinkStatusLabels: Record<string, string> = { CONNECTED: "연결됨", DISCONNECTED: "연결 해제", REVOKED: "연결 취소", UNLINKED: "연결 안 됨" };
const riotSyncStatusLabels: Record<string, string> = { QUEUED: "동기화 대기", RUNNING: "동기화 중", RETRY_WAIT: "재시도 대기", SUCCEEDED: "동기화 완료", PARTIAL: "일부 반영", FAILED: "동기화 실패", CANCELLED: "동기화 취소" };

function label(labels: Readonly<Record<string, string>>, value: string | null | undefined) {
  return value ? labels[value] ?? "상태 확인 필요" : "정보 없음";
}

export function publicCompetitionStatusLabel(value: string | null | undefined) { return label(competitionStatusLabels, value); }
export function publicEventStatusLabel(value: string | null | undefined) { return label(eventStatusLabels, value); }
export function publicDestructionStatusLabel(value: string | null | undefined) { return label(destructionStatusLabels, value); }
export function publicCompetitionFormatLabel(value: string | null | undefined) { return label(competitionFormatLabels, value); }
export function publicPreliminaryFormatLabel(value: string | null | undefined) { return label(preliminaryFormatLabels, value); }
export function publicParticipationStatusLabel(value: string | null | undefined) { return label(participationStatusLabels, value); }
export function publicRiotLinkMethodLabel(value: string | null | undefined) { return label(riotLinkMethodLabels, value); }
export function publicRiotLinkStatusLabel(value: string | null | undefined) { return label(riotLinkStatusLabels, value); }
export function publicRiotSyncStatusLabel(value: string | null | undefined) { return label(riotSyncStatusLabels, value); }
