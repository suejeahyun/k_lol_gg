import { SeasonServiceError } from "./season";

/** Count linked members and name-only entries together; reserves never consume a main seat. */
export function assertInhouseSeatAvailable(input: Readonly<{
  capacity: number;
  participantCount: number;
  alreadyParticipating: boolean;
  reserve: boolean;
}>) {
  if (!input.reserve && !input.alreadyParticipating && input.participantCount >= input.capacity) {
    throw new SeasonServiceError("RECRUIT_FULL", "본 참가 정원이 찼어요. 예비 참가를 선택해 주세요.");
  }
}

export function reachedInhouseCapacity(before: number, after: number, capacity: number) {
  return capacity === 10 && before < 10 && after === 10;
}

export const INHOUSE_DISCORD_WAIT_NOTICE = "시작 시간 10분 전 내전 디스코드방에 대기해주세요~";
