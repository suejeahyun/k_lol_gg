"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function CommunityLikeButton({ postId, liked, likeCount }: { postId: number; liked: boolean; likeCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch(`/api/community/posts/${postId}/like`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }
  return <button className="button button--ghost" onClick={toggle} disabled={busy}>{liked ? "좋아요 취소" : "좋아요"} · {likeCount}</button>;
}

export function CommunityHideButton({ postId, label = "삭제" }: { postId: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function hide() {
    if (!confirm("화면에서 숨김 처리하시겠습니까?")) return;
    setBusy(true);
    const res = await fetch(`/api/community/posts/${postId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) {
      router.push("/community");
      router.refresh();
    }
  }
  return <button className="button button--danger" onClick={hide} disabled={busy}>{label}</button>;
}

export function CommunityCommentForm({ postId }: { postId: number }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const res = await fetch(`/api/community/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.message ?? "댓글 등록 중 오류가 발생했습니다.");
      return;
    }
    setContent("");
    router.refresh();
  }
  return (
    <form className="community-comment-form" onSubmit={submit}>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} placeholder="댓글을 입력하세요" required />
      {message && <p className="form-error">{message}</p>}
      <button className="button button--primary">댓글 등록</button>
    </form>
  );
}

export function CommunityCommentHideButton({ commentId }: { commentId: number }) {
  const router = useRouter();
  async function hide() {
    if (!confirm("댓글을 숨김 처리하시겠습니까?")) return;
    const res = await fetch(`/api/community/comments/${commentId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }
  return <button className="community-text-button" onClick={hide}>삭제</button>;
}

export function CommunityReportButton({ targetType, postId, commentId }: { targetType: "POST" | "COMMENT"; postId?: number; commentId?: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("비방/저격");
  const [detail, setDetail] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch("/api/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, postId, commentId, reason, detail }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(data.message ?? (res.ok ? "신고가 접수되었습니다." : "신고 접수 중 오류가 발생했습니다."));
    if (res.ok) setOpen(false);
  }

  return (
    <div className="community-report-box">
      <button className="community-text-button" onClick={() => setOpen((value) => !value)}>신고</button>
      {open && (
        <form className="community-report-form" onSubmit={submit}>
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option>비방/저격</option>
            <option>욕설</option>
            <option>도배</option>
            <option>부적절한 영상 링크</option>
            <option>개인정보 노출</option>
            <option>기타</option>
          </select>
          <input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="상세 내용 선택 입력" />
          <button className="button button--ghost">접수</button>
        </form>
      )}
      {message && <p className="form-help">{message}</p>}
    </div>
  );
}
