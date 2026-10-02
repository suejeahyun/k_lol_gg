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
      setMessage("명령을 복사했어요. 카카오톡 모집방에 붙여 넣고 봇의 최신 명단을 확인해 주세요. 아직 참가가 완료된 것은 아니에요.");
      recordUsageAction("recruit.instructions");
    } catch { setMessage(`복사할 수 없어요. 카카오톡 방에 ‘${command}’를 직접 입력해 주세요.`); }
  }
  return <div className="recruit-instructions">
    <p>{full ? "현재 정원이 찼어요. 최신 명단에서 빈자리나 예비 칸을 확인하세요." : "카카오톡 모집방에서 참가해요. 최신 명단의 빈자리를 먼저 확인하세요."}</p>
    <button type="button" onClick={copy}>{full ? "최신 명단 확인용 명령 복사" : "참가 명령 복사"}</button>
    <details><summary>카카오톡에서 참가하는 방법</summary><ol>
      <li>모집이 올라온 카카오톡 방에 <code>{command}</code>를 보내세요.</li>
      <li>봇의 최신 명단 전체를 복사하고 {full ? "빈자리 또는 예비 칸" : "빈칸"}에 이름을 적으세요.</li>
      <li>전체 명단을 전송하고 봇의 저장 완료 안내를 확인하세요.</li>
    </ol></details>
    <div className="recruit-help-links"><Link href="/help/recruits#find-room">모집방을 모르겠어요</Link><Link href="/help/recruits">참가·취소 방법</Link></div>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
