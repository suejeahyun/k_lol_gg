"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Submission = { id: number; publicCode: string; status: string; targetName: string; nicknameTag: string; category: string; issuedDate: string; createdAt: string; assetIds: number[] };
type Task = { id: number; publicCode: string; status: string; targetName: string; requiredGameCount: number; dueAt: string; assetIds: number[] };
type BanReview = { id: number; targetName: string; nicknameTag: string; warningCount: number; createdAt: string };

export default function DisciplineWorkflowClient({ submissions, tasks, banReviews }: { submissions: Submission[]; tasks: Task[]; banReviews: BanReview[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function reviewSubmission(id: number, action: "APPROVE" | "REJECT") {
    const value = window.prompt(action === "APPROVE" ? "사이트에만 저장할 경고 사유를 입력하세요. 카카오 양식에는 표시되지 않습니다." : "반려 사유를 입력하세요.");
    if (!value?.trim()) return;
    setBusy(id);
    const response = await fetch(`/api/admin/discipline-submissions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "APPROVE" ? { action, reason: value } : { action, rejectionReason: value }) });
    const result = await response.json().catch(() => ({})) as { message?: string; taskCode?: string };
    setBusy(null);
    if (!response.ok) return window.alert(result.message || "처리에 실패했습니다.");
    window.alert(action === "APPROVE" ? `승인했습니다.${result.taskCode ? `\n차감 인증번호: ${result.taskCode}` : ""}` : "반려했습니다.");
    router.refresh();
  }

  async function reviewTask(id: number, action: "APPROVE" | "REJECT") {
    const note = window.prompt(action === "APPROVE" ? "승인 메모(선택)" : "반려 사유(필수)") ?? "";
    if (action === "REJECT" && !note.trim()) return;
    setBusy(-id);
    const response = await fetch(`/api/admin/discipline-tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
    const result = await response.json().catch(() => ({})) as { message?: string };
    setBusy(null);
    if (!response.ok) return window.alert(result.message || "처리에 실패했습니다.");
    router.refresh();
  }

  async function reviewBan(id: number, action: "APPROVE" | "REJECT") {
    const note = window.prompt(action === "APPROVE" ? "강퇴 사유/메모(미입력 시 경고 3회 누적)" : "보류/반려 사유(필수)") ?? "";
    if (action === "REJECT" && !note.trim()) return;
    setBusy(1000000 + id);
    const response = await fetch(`/api/admin/discipline-ban-reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
    const result = await response.json().catch(() => ({})) as { message?: string };
    setBusy(null);
    if (!response.ok) return window.alert(result.message || "처리에 실패했습니다.");
    router.refresh();
  }

  return <>
    {banReviews.length ? <section className="discipline-table-card"><h2>경고 3회 누적 강퇴 검토</h2><div className="discipline-table-wrap"><table><thead><tr><th>대상</th><th>활성 경고</th><th>생성일</th><th>처리</th></tr></thead><tbody>{banReviews.map((item) => <tr key={item.id}><td>{item.targetName}<br/><small>{item.nicknameTag}</small></td><td>{item.warningCount}회</td><td>{item.createdAt}</td><td><div className="discipline-actions"><button disabled={busy === 1000000 + item.id} className="admin-button admin-button--danger" onClick={() => void reviewBan(item.id, "APPROVE")}>강퇴 확정</button><button disabled={busy === 1000000 + item.id} className="admin-button admin-button--ghost" onClick={() => void reviewBan(item.id, "REJECT")}>보류</button></div></td></tr>)}</tbody></table></div></section> : null}
    <section className="discipline-table-card">
      <h2>카카오 경고 접수</h2>
      <p className="discipline-help">경고 사유는 이 승인 단계에서만 입력하며 카카오 양식과 공개 통계에는 표시하지 않습니다.</p>
      {submissions.length === 0 ? <p>검토할 접수 건이 없습니다.</p> : <div className="discipline-table-wrap"><table><thead><tr><th>접수</th><th>대상</th><th>구분/부여일</th><th>증빙</th><th>처리</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}><td>{item.publicCode}<br/><small>{item.createdAt}</small></td><td>{item.targetName}<br/><small>{item.nicknameTag}</small></td><td>{item.category}<br/><small>{item.issuedDate}</small></td><td>{item.assetIds.length ? item.assetIds.map((assetId, index) => <a key={assetId} className="admin-button admin-button--ghost" target="_blank" href={`/api/admin/private-assets/${assetId}`}>{index + 1}장</a>) : "없음"}</td><td><div className="discipline-actions"><button disabled={busy === item.id} className="admin-button" onClick={() => void reviewSubmission(item.id, "APPROVE")}>승인</button><button disabled={busy === item.id} className="admin-button admin-button--danger" onClick={() => void reviewSubmission(item.id, "REJECT")}>반려</button></div></td></tr>)}</tbody></table></div>}
    </section>
    <section className="discipline-table-card">
      <h2>경고 차감 인증</h2>
      <p className="discipline-help">승인 시 연결된 경고 1건만 비활성화됩니다.</p>
      {tasks.length === 0 ? <p>검토할 인증이 없습니다.</p> : <div className="discipline-table-wrap"><table><thead><tr><th>인증번호</th><th>대상</th><th>요구/기한</th><th>사진</th><th>처리</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.publicCode}</td><td>{task.targetName}</td><td>{task.requiredGameCount}판<br/><small>{task.dueAt}</small></td><td>{task.assetIds.map((assetId, index) => <a key={assetId} className="admin-button admin-button--ghost" target="_blank" href={`/api/admin/private-assets/${assetId}`}>{index + 1}장</a>)}</td><td><div className="discipline-actions"><button disabled={busy === -task.id} className="admin-button" onClick={() => void reviewTask(task.id, "APPROVE")}>차감 승인</button><button disabled={busy === -task.id} className="admin-button admin-button--danger" onClick={() => void reviewTask(task.id, "REJECT")}>반려</button></div></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
