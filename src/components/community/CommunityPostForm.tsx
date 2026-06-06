"use client";

import { CommunityPostType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { communityTypeLabels, communityTypePaths } from "@/lib/community/meta";

type MatchOption = { id: number; title: string };

type CommunityPostFormProps = {
  type: CommunityPostType;
  post?: {
    id: number;
    title: string;
    content: string;
    videoUrl: string | null;
    matchSeriesId: number | null;
  };
  matchOptions?: MatchOption[];
  fixedMatchSeriesId?: number;
};

export default function CommunityPostForm({ type, post, matchOptions = [], fixedMatchSeriesId }: CommunityPostFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [videoUrl, setVideoUrl] = useState(post?.videoUrl ?? "");
  const [matchSeriesId, setMatchSeriesId] = useState(String(fixedMatchSeriesId ?? post?.matchSeriesId ?? ""));
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const payload = {
      type,
      title,
      content,
      videoUrl: videoUrl || null,
      matchSeriesId: matchSeriesId ? Number(matchSeriesId) : null,
    };

    const res = await fetch(post ? `/api/community/posts/${post.id}` : "/api/community/posts", {
      method: post ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setMessage(data.message ?? "저장 중 오류가 발생했습니다.");
      return;
    }

    router.push(`/community/posts/${data.post.id}`);
    router.refresh();
  }

  return (
    <form className="community-form" onSubmit={onSubmit}>
      <div className="form-row">
        <label>게시판</label>
        <input value={communityTypeLabels[type]} disabled />
      </div>

      <div className="form-row">
        <label>제목</label>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="제목을 입력하세요" required />
      </div>

      {(type === "HIGHLIGHT" || type === "MATCH_REVIEW") && (
        <div className="form-row">
          <label>영상 링크</label>
          <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="YouTube / 치지직 / Twitch / Discord / Drive 링크" />
          <p className="form-help">파일 업로드는 사용하지 않습니다. YouTube 링크는 썸네일이 자동 지정됩니다.</p>
        </div>
      )}

      {type === "MATCH_REVIEW" && !fixedMatchSeriesId && (
        <div className="form-row">
          <label>연결할 내전</label>
          <select value={matchSeriesId} onChange={(event) => setMatchSeriesId(event.target.value)}>
            <option value="">선택 안 함</option>
            {matchOptions.map((match) => (
              <option key={match.id} value={match.id}>{match.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="form-row">
        <label>내용</label>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={10} placeholder="내용을 입력하세요" required />
      </div>

      {message && <p className="form-error">{message}</p>}

      <div className="community-form__actions">
        <button className="button button--primary" disabled={submitting}>{submitting ? "저장 중" : post ? "수정 저장" : "등록"}</button>
        <button className="button button--ghost" type="button" onClick={() => router.push(communityTypePaths[type])}>목록</button>
      </div>
    </form>
  );
}
