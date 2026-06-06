"use client";

import { CommunityPostType } from "@prisma/client";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
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
    tags?: string[];
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

function toInitialHtml(value: string) {
  const raw = value || "";
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function normalizeTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((tag) => tag.trim().replace(/^#+/, ""))
        .filter(Boolean)
        .map((tag) => tag.slice(0, 24)),
    ),
  ).slice(0, 10);
}

export default function CommunityPostForm({ type, post, matchOptions = [], fixedMatchSeriesId }: CommunityPostFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [videoUrl, setVideoUrl] = useState(post?.videoUrl ?? "");
  const [headline, setHeadline] = useState("");
  const [matchSeriesId, setMatchSeriesId] = useState(String(fixedMatchSeriesId ?? post?.matchSeriesId ?? ""));
  const [tagsText, setTagsText] = useState((post?.tags ?? []).map((tag) => `#${tag}`).join(" "));
  const [allowComment, setAllowComment] = useState(true);
  const [autoLineBreak, setAutoLineBreak] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const draftKey = useMemo(() => `klol-community-draft:${post?.id ?? "new"}:${type}`, [post?.id, type]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: "내용을 입력하세요." }),
    ],
    content: toInitialHtml(post?.content ?? ""),
    editorProps: {
      attributes: {
        class: "community-tiptap__content",
      },
    },
    immediatelyRender: false,
  });

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 주소를 입력하세요.", previousUrl ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function saveDraft() {
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        title,
        content: editor?.getHTML() ?? "",
        videoUrl,
        headline,
        matchSeriesId,
        tagsText,
        savedAt: new Date().toISOString(),
      }),
    );
    setMessage("임시저장되었습니다.");
  }

  function loadDraft() {
    const raw = localStorage.getItem(draftKey);
    if (!raw) {
      setMessage("저장된 임시글이 없습니다.");
      return;
    }
    const draft = JSON.parse(raw) as Partial<{ title: string; content: string; videoUrl: string; headline: string; matchSeriesId: string; tagsText: string }>;
    setTitle(draft.title ?? "");
    setVideoUrl(draft.videoUrl ?? "");
    setHeadline(draft.headline ?? "");
    setMatchSeriesId(draft.matchSeriesId ?? "");
    setTagsText(draft.tagsText ?? "");
    editor?.commands.setContent(toInitialHtml(draft.content ?? ""));
    setMessage("임시글을 불러왔습니다.");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const html = editor?.getHTML().trim() ?? "";
    const content = autoLineBreak ? html : html.replace(/(<p><\/p>){2,}/g, "<p></p>");
    const payload = {
      type,
      title: headline ? `[${headline}] ${title}` : title,
      content,
      videoUrl: videoUrl || null,
      matchSeriesId: matchSeriesId ? Number(matchSeriesId) : null,
      tags: normalizeTags(tagsText),
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

          <div className="community-tiptap" aria-label="본문 편집기">
            <div className="community-tiptap__toolbar">
              <button type="button" className={editor?.isActive("bold") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleBold().run()}>굵게</button>
              <button type="button" className={editor?.isActive("italic") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleItalic().run()}>기울임</button>
              <button type="button" className={editor?.isActive("strike") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleStrike().run()}>취소선</button>
              <button type="button" className={editor?.isActive("blockquote") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>인용</button>
              <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>구분선</button>
              <button type="button" className={editor?.isActive("link") ? "is-active" : ""} onClick={setLink}>링크</button>
              <button type="button" className={editor?.isActive("bulletList") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleBulletList().run()}>목록</button>
              <button type="button" className={editor?.isActive("orderedList") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>번호</button>
              <button type="button" className={editor?.isActive("code") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleCode().run()}>코드</button>
            </div>
            <EditorContent editor={editor} />
          </div>

          <div className="community-tag-input">
            <label htmlFor="community-tags">태그</label>
            <input
              id="community-tags"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="#바론 #펜타킬 #탑차이 처럼 입력하세요. 최대 10개"
            />
            <div className="community-tag-preview">
              {normalizeTags(tagsText).map((tag) => <span key={tag}>#{tag}</span>)}
            </div>
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
