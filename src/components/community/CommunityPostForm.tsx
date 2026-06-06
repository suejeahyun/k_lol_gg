"use client";

import { CommunityPostType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useRef, useState } from "react";
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

const headlineOptions: Record<CommunityPostType, string[]> = {
  HIGHLIGHT: ["명장면", "슈퍼플레이", "웃긴장면", "역전장면"],
  SUGGESTION: ["오류", "개선", "기능요청", "운영건의"],
  MATCH_REVIEW: ["후기", "밴픽", "MVP", "피드백"],
  FREE: ["잡담", "정보", "질문", "후기"],
  NOTICE_COMMENT: ["확인", "질문", "의견"],
};

export default function CommunityPostForm({ type, post, matchOptions = [], fixedMatchSeriesId }: CommunityPostFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [videoUrl, setVideoUrl] = useState(post?.videoUrl ?? "");
  const [headline, setHeadline] = useState("");
  const [matchSeriesId, setMatchSeriesId] = useState(String(fixedMatchSeriesId ?? post?.matchSeriesId ?? ""));
  const [allowComment, setAllowComment] = useState(true);
  const [autoLineBreak, setAutoLineBreak] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const draftKey = useMemo(() => `klol-community-draft:${post?.id ?? "new"}:${type}`, [post?.id, type]);

  function insertFormat(prefix: string, suffix = prefix, placeholder = "텍스트") {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((prev) => `${prev}${prefix}${placeholder}${suffix}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`;
    setContent(next);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function insertLine(value: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((prev) => `${prev}\n${value}`);
      return;
    }
    const start = textarea.selectionStart;
    const next = `${content.slice(0, start)}${value}${content.slice(start)}`;
    setContent(next);
    requestAnimationFrame(() => textarea.focus());
  }

  function saveDraft() {
    localStorage.setItem(
      draftKey,
      JSON.stringify({ title, content, videoUrl, headline, matchSeriesId, savedAt: new Date().toISOString() }),
    );
    setMessage("임시저장되었습니다.");
  }

  function loadDraft() {
    const raw = localStorage.getItem(draftKey);
    if (!raw) {
      setMessage("저장된 임시글이 없습니다.");
      return;
    }
    const draft = JSON.parse(raw) as Partial<{ title: string; content: string; videoUrl: string; headline: string; matchSeriesId: string }>;
    setTitle(draft.title ?? "");
    setContent(draft.content ?? "");
    setVideoUrl(draft.videoUrl ?? "");
    setHeadline(draft.headline ?? "");
    setMatchSeriesId(draft.matchSeriesId ?? "");
    setMessage("임시글을 불러왔습니다.");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const normalizedContent = autoLineBreak ? content : content.replace(/\n{3,}/g, "\n\n");
    const payload = {
      type,
      title: headline ? `[${headline}] ${title}` : title,
      content: normalizedContent,
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

    localStorage.removeItem(draftKey);
    router.push(`/community/posts/${data.post.id}`);
    router.refresh();
  }

  return (
    <form className="community-write" onSubmit={onSubmit}>
      <div className="community-write__topbar">
        <h2>{communityTypeLabels[type]} 글쓰기</h2>
        <div className="community-write__top-actions">
          <button className="button button--ghost" type="button" onClick={loadDraft}>임시글 불러오기</button>
          <button className="button button--ghost" type="button" onClick={saveDraft}>임시저장</button>
          <button className="button button--primary" disabled={submitting}>{submitting ? "등록 중" : post ? "수정 저장" : "등록"}</button>
        </div>
      </div>

      <div className="community-write__layout">
        <section className="community-write__main">
          <div className="community-write__fields">
            <select value={type} disabled aria-label="게시판 선택">
              <option>{communityTypeLabels[type]}</option>
            </select>

            <select value={headline} onChange={(event) => setHeadline(event.target.value)} aria-label="말머리 선택">
              <option value="">말머리 선택</option>
              {headlineOptions[type]?.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="제목을 입력해 주세요." required />
          </div>

          {(type === "HIGHLIGHT" || type === "MATCH_REVIEW") && (
            <input className="community-write__video" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="YouTube / 치지직 / Twitch / Discord / Drive 링크" />
          )}

          {type === "MATCH_REVIEW" && !fixedMatchSeriesId && (
            <select className="community-write__match" value={matchSeriesId} onChange={(event) => setMatchSeriesId(event.target.value)}>
              <option value="">연결할 내전 선택 안 함</option>
              {matchOptions.map((match) => (
                <option key={match.id} value={match.id}>{match.title}</option>
              ))}
            </select>
          )}

          <div className="community-editor" aria-label="본문 편집기">
            <div className="community-editor__toolbar">
              <button type="button" onClick={() => insertFormat("**", "**")}>굵게</button>
              <button type="button" onClick={() => insertFormat("_", "_")}>기울임</button>
              <button type="button" onClick={() => insertFormat("~~", "~~")}>취소선</button>
              <button type="button" onClick={() => insertLine("\n> 인용문\n")}>인용</button>
              <button type="button" onClick={() => insertLine("\n---\n")}>구분선</button>
              <button type="button" onClick={() => insertFormat("[", "](https://)", "링크")}>링크</button>
              <button type="button" onClick={() => insertLine("\n- 목록\n")}>목록</button>
              <button type="button" onClick={() => insertLine("\n1. 항목\n")}>번호</button>
              <button type="button" onClick={() => insertLine("\n`코드`\n")}>코드</button>
            </div>

            <textarea ref={textareaRef} value={content} onChange={(event) => setContent(event.target.value)} rows={18} placeholder="내용을 입력하세요." required />
          </div>

          {message && <p className={message.includes("오류") || message.includes("없습니다") ? "form-error" : "form-help"}>{message}</p>}
        </section>

        <aside className="community-write__side">
          <div className="community-write__option-card">
            <strong>공개 설정</strong>
            <p>승인 완료 유저가 작성한 글은 즉시 노출됩니다.</p>
          </div>

          <label className="community-write__check">
            <input type="checkbox" checked={allowComment} onChange={(event) => setAllowComment(event.target.checked)} />
            댓글 허용
          </label>

          <label className="community-write__check">
            <input type="checkbox" checked={autoLineBreak} onChange={(event) => setAutoLineBreak(event.target.checked)} />
            자동 줄바꿈 사용
          </label>

          <button className="button button--ghost community-write__side-button" type="button" onClick={() => router.push(communityTypePaths[type])}>목록</button>
        </aside>
      </div>
    </form>
  );
}
