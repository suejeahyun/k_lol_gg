"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import DisciplineTaskHandoff from "@/components/admin/DisciplineTaskHandoff";

type Submission = { id: number; publicCode: string; status: string; targetName: string; nicknameTag: string; category: string; issuedDate: string; createdAt: string; assetIds: number[] };
type Task = { id: number; publicCode: string; status: string; targetName: string; requiredGameCount: number; dueAt: string; assetIds: number[] };
type BanReview = { id: number; targetName: string; nicknameTag: string; warningCount: number; createdAt: string };
type ReviewRequest = { kind: "submission" | "task" | "ban"; id: number; action: "APPROVE" | "REJECT"; title: string; description: string; required: boolean; targetName?: string; requiredGameCount?: number };
type TaskHandoff = { publicCode: string; targetName?: string; requiredGameCount?: number };

export default function DisciplineWorkflowClient({ submissions, tasks, banReviews }: { submissions: Submission[]; tasks: Task[]; banReviews: BanReview[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [review, setReview] = useState<ReviewRequest | null>(null);
  const [reviewValue, setReviewValue] = useState("");
  const [message, setMessage] = useState("");
  const [taskHandoff, setTaskHandoff] = useState<TaskHandoff | null>(null);

  function openReview(next: ReviewRequest) {
    setReview(next);
    setReviewValue("");
    setMessage("");
  }

  async function submitReview() {
    if (!review || (review.required && !reviewValue.trim())) return;
    const busyKey = review.kind === "task" ? -review.id : review.kind === "ban" ? 1000000 + review.id : review.id;
    const url = review.kind === "submission" ? `/api/admin/discipline-submissions/${review.id}` : review.kind === "task" ? `/api/admin/discipline-tasks/${review.id}` : `/api/admin/discipline-ban-reviews/${review.id}`;
    const body = review.kind === "submission"
      ? (review.action === "APPROVE" ? { action: review.action, reason: reviewValue } : { action: review.action, rejectionReason: reviewValue })
      : { action: review.action, note: reviewValue };
    setBusy(busyKey);
    setMessage("");
    const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { message?: string; taskCode?: string };
    setBusy(null);
    if (!response.ok) {
      setMessage(result.message || "처리에 실패했습니다.");
      return;
    }
    const successMessage = review.kind === "submission" && review.action === "APPROVE"
      ? `승인했습니다.${result.taskCode ? " 대상자는 내정보에서 사진 제출 과제를 확인할 수 있습니다." : ""}`
      : review.action === "APPROVE" ? "승인했습니다." : "반려했습니다.";
    if (review.kind === "submission" && review.action === "APPROVE" && result.taskCode) {
      setTaskHandoff({
        publicCode: result.taskCode,
        targetName: review.targetName,
        requiredGameCount: review.requiredGameCount,
      });
    }
    setReview(null);
    setReviewValue("");
    setMessage(successMessage);
    router.refresh();
  }

  return <>
    {message ? <p className="discipline-result" role="status">{message}</p> : null}
    {taskHandoff ? <DisciplineTaskHandoff {...taskHandoff} /> : null}
    {banReviews.length ? <section className="discipline-table-card"><h2>경고 3회 누적 강퇴 검토</h2><div className="discipline-table-wrap"><table><thead><tr><th>대상</th><th>활성 경고</th><th>생성일</th><th>처리</th></tr></thead><tbody>{banReviews.map((item) => <tr key={item.id}><td>{item.targetName}<br/><small>{item.nicknameTag}</small></td><td>{item.warningCount}회</td><td>{item.createdAt}</td><td><div className="discipline-actions"><button disabled={busy === 1000000 + item.id} className="admin-button admin-button--danger" onClick={() => openReview({ kind: "ban", id: item.id, action: "APPROVE", title: "강퇴 확정", description: "강퇴 사유/메모를 입력하세요. 미입력 시 경고 3회 누적으로 기록됩니다.", required: false })}>강퇴 확정</button><button disabled={busy === 1000000 + item.id} className="admin-button admin-button--ghost" onClick={() => openReview({ kind: "ban", id: item.id, action: "REJECT", title: "강퇴 검토 보류", description: "보류 또는 반려 사유를 입력하세요.", required: true })}>보류</button></div></td></tr>)}</tbody></table></div></section> : null}
    <section className="discipline-table-card">
      <h2>카카오 경고 접수</h2>
      <p className="discipline-help">경고 사유는 이 승인 단계에서만 입력하며 카카오 양식과 공개 통계에는 표시하지 않습니다.</p>
      {submissions.length === 0 ? <p>검토할 접수 건이 없습니다.</p> : <div className="discipline-table-wrap"><table><thead><tr><th>접수</th><th>대상</th><th>구분/부여일</th><th>증빙</th><th>처리</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}><td>{item.publicCode}<br/><small>{item.createdAt}</small></td><td>{item.targetName}<br/><small>{item.nicknameTag}</small></td><td>{item.category}<br/><small>{item.issuedDate}</small></td><td>{item.assetIds.length ? item.assetIds.map((assetId, index) => <a key={assetId} className="admin-button admin-button--ghost" target="_blank" href={`/api/admin/private-assets/${assetId}`}>{index + 1}장</a>) : "없음"}</td><td>{item.status === "PENDING_REVIEW" ? <div className="discipline-actions"><button disabled={busy === item.id} className="admin-button" onClick={() => openReview({ kind: "submission", id: item.id, action: "APPROVE", title: `${item.publicCode} 승인`, description: "사이트에만 저장할 경고 사유를 입력하세요. 카카오 양식과 공개 통계에는 표시되지 않습니다.", required: true, targetName: item.targetName, requiredGameCount: item.category === "내전" ? 15 : 10 })}>승인</button><button disabled={busy === item.id} className="admin-button admin-button--danger" onClick={() => openReview({ kind: "submission", id: item.id, action: "REJECT", title: `${item.publicCode} 반려`, description: "반려 사유를 입력하세요.", required: true })}>반려</button></div> : <span className="admin-muted">사진 업로드 대기 · 현재 {item.assetIds.length}장</span>}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="discipline-table-card">
      <h2>경고 차감 인증</h2>
      <p className="discipline-help">승인 시 연결된 경고 1건만 비활성화됩니다.</p>
      {tasks.length === 0 ? <p>검토할 인증이 없습니다.</p> : <div className="discipline-table-wrap"><table><thead><tr><th>인증번호</th><th>대상</th><th>요구/기한</th><th>사진</th><th>처리</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.publicCode}</td><td>{task.targetName}</td><td>{task.requiredGameCount}판<br/><small>{task.dueAt}</small></td><td>{task.assetIds.map((assetId, index) => <a key={assetId} className="admin-button admin-button--ghost" target="_blank" href={`/api/admin/private-assets/${assetId}`}>{index + 1}장</a>)}</td><td><div className="discipline-actions"><button disabled={busy === -task.id} className="admin-button" onClick={() => openReview({ kind: "task", id: task.id, action: "APPROVE", title: `${task.publicCode} 차감 승인`, description: "승인 메모를 입력할 수 있습니다.", required: false })}>차감 승인</button><button disabled={busy === -task.id} className="admin-button admin-button--danger" onClick={() => openReview({ kind: "task", id: task.id, action: "REJECT", title: `${task.publicCode} 반려`, description: "반려 사유를 입력하세요.", required: true })}>반려</button></div></td></tr>)}</tbody></table></div>}
    </section>
    {review ? <div className="discipline-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy === null) setReview(null); }}>
      <section className="discipline-review-dialog" role="dialog" aria-modal="true" aria-labelledby="discipline-review-title">
        <h2 id="discipline-review-title">{review.title}</h2>
        <p>{review.description}</p>
        <label htmlFor="discipline-review-value">{review.required ? "사유 (필수)" : "메모 (선택)"}</label>
        <textarea id="discipline-review-value" autoFocus rows={5} value={reviewValue} onChange={(event) => setReviewValue(event.target.value)} />
        {message ? <p className="discipline-review-error" role="alert">{message}</p> : null}
        <div className="discipline-actions">
          <button type="button" className="admin-button admin-button--ghost" disabled={busy !== null} onClick={() => setReview(null)}>취소</button>
          <button type="button" className={review.action === "REJECT" ? "admin-button admin-button--danger" : "admin-button"} disabled={busy !== null || (review.required && !reviewValue.trim())} onClick={() => void submitReview()}>{busy !== null ? "처리 중" : review.action === "APPROVE" ? "승인 실행" : "반려 실행"}</button>
        </div>
      </section>
    </div> : null}
  </>;
}
