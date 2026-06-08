export const DEFAULT_AUTO_FINISH_HOLD_MINUTES = Number(process.env.DISCORD_AUTO_FINISH_HOLD_MINUTES || 10);

export function shouldEnterFinishCandidate(params: {
  expectedCount: number;
  presentExpectedCount: number;
}) {
  const { expectedCount, presentExpectedCount } = params;
  if (expectedCount <= 0) return false;
  return presentExpectedCount === 0;
}

export function getAutoFinishReason(params: {
  recruitNo: number;
  title: string;
  expectedCount: number;
  presentExpectedCount: number;
  nonParticipantCount: number;
  holdMinutes: number;
}) {
  return [
    `#${params.recruitNo} ${params.title}`,
    `참가자 잔류 ${params.presentExpectedCount}/${params.expectedCount}`,
    `비참가자 음성 인원 ${params.nonParticipantCount}명`,
    `종료 후보 ${params.holdMinutes}분 유지`,
  ].join(" · ");
}
