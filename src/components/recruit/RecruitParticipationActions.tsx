"use client";

import { useState } from "react";

type RecruitParticipationActionsProps = {
  recruitNo: number;
  openChatUrl: string | null;
  closed?: boolean;
};

export default function RecruitParticipationActions({
  recruitNo,
  openChatUrl,
  closed = false,
}: RecruitParticipationActionsProps) {
  const [feedback, setFeedback] = useState("");

  if (closed) {
    return <p className="recruit-participation-actions__feedback">마감된 구인입니다.</p>;
  }

  const participationMessage = `구인 #${recruitNo}에 참여하고 싶습니다.`;

  async function copyParticipationMessage() {
    try {
      await navigator.clipboard.writeText(participationMessage);
      setFeedback("참여 메시지를 복사했습니다. 카카오톡 대화방에 붙여 넣어 주세요.");
    } catch {
      setFeedback(`복사하지 못했습니다. 직접 입력해 주세요: ${participationMessage}`);
    }
  }

  return (
    <div className="recruit-participation-actions">
      {openChatUrl ? (
        <a className="app-button" href={openChatUrl} rel="noreferrer" target="_blank">
          카카오톡에서 참여
        </a>
      ) : null}
      <button className="chip-button" type="button" onClick={copyParticipationMessage}>
        참여 메시지 복사
      </button>
      {!openChatUrl ? (
        <span className="recruit-participation-actions__feedback">
          카카오톡 참여 링크를 준비 중입니다. 메시지를 복사해 운영진에게 보내 주세요.
        </span>
      ) : null}
      <span className="recruit-participation-actions__feedback" aria-live="polite">
        {feedback}
      </span>
    </div>
  );
}
