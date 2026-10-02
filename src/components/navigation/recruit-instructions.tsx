"use client";

import { useState } from "react";
import Link from "next/link";
import { recordUsageAction } from "@/components/usage/usage-actions";

export function RecruitInstructions({ recruitNumber }: { recruitNumber: number }) {
  const [message, setMessage] = useState("");
  const command = `구인상세 ${recruitNumber}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setMessage("복사했어요. 모집이 올라온 카카오톡 방에 붙여 넣으세요.");
      recordUsageAction("recruit.instructions");
    } catch { setMessage(`복사할 수 없어요. 카카오톡 방에 ‘${command}’를 직접 입력해 주세요.`); }
  }
  return <div className="recruit-instructions">
    <button type="button" onClick={copy}>참여용 명령 복사</button>
    <p>모집이 올라온 카카오톡 방에서 <code>{command}</code>를 보내 최신 명단을 받은 뒤 빈칸에 이름을 적어 전송하세요.</p>
    <Link href="/help/recruits">참여·취소 방법 보기</Link>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
