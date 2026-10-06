"use client";

import { useState } from "react";
import Link from "next/link";
import { recordUsageAction } from "@/components/usage/usage-actions";

export function RecruitInstructions({ recruitNumber, full = false }: { recruitNumber: number; full?: boolean }) {
  const [message, setMessage] = useState("");
  const command = `구인상세 ${recruitNumber}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setMessage("명령 복사 완료 · 참가 미완료. 카카오 모집방에서 최신 명단을 확인해 주세요.");
      recordUsageAction("recruit.instructions");
    } catch { setMessage(`복사할 수 없어요. 카카오톡 방에 ‘${command}’를 직접 입력해 주세요.`); }
  }
  return <div className="recruit-instructions">
    <button type="button" onClick={copy}>카카오 명단 조회 명령 복사</button>
    <details><summary>카카오톡에서 참가하는 방법</summary><ol>
      <li>카카오 모집방에 <code>{command}</code> 전송</li>
      <li>최신 명단 전체 복사 → {full ? "빈자리·예비 칸" : "빈칸"}에 이름 입력</li>
      <li>전체 명단 전송 → 봇의 저장 완료 확인</li>
    </ol></details>
    <div className="recruit-help-links"><Link href="/help/recruits#find-room">모집방을 모르겠어요</Link><Link href="/help/recruits">참가·취소 방법</Link></div>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
