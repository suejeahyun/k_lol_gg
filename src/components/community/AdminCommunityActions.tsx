"use client";

import { CommunityReportStatus, CommunitySuggestionStatus } from "@prisma/client";
import { useRouter } from "next/navigation";

export function AdminPostHideButton({ postId }: { postId: number }) {
  const router = useRouter();
  async function hide() {
    if (!confirm("관리자 숨김 처리하시겠습니까?")) return;
    const res = await fetch(`/api/community/posts/${postId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }
  return <button className="button button--danger" onClick={hide}>숨김</button>;
}

export function AdminSuggestionStatusSelect({ postId, value }: { postId: number; value: CommunitySuggestionStatus }) {
  const router = useRouter();
  async function change(next: string) {
    const res = await fetch(`/api/admin/community/suggestions/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionStatus: next }),
    });
    if (res.ok) router.refresh();
  }
  return (
    <select value={value} onChange={(event) => change(event.target.value)}>
      <option value="RECEIVED">접수</option>
      <option value="REVIEWING">검토중</option>
      <option value="PLANNED">적용예정</option>
      <option value="COMPLETED">완료</option>
      <option value="HOLD">보류</option>
    </select>
  );
}

export function AdminReportStatusSelect({ reportId, value }: { reportId: number; value: CommunityReportStatus }) {
  const router = useRouter();
  async function change(next: string) {
    const res = await fetch("/api/community/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reportId, status: next }),
    });
    if (res.ok) router.refresh();
  }
  return (
    <select value={value} onChange={(event) => change(event.target.value)}>
      <option value="PENDING">대기</option>
      <option value="RESOLVED">처리완료</option>
      <option value="REJECTED">반려</option>
    </select>
  );
}
