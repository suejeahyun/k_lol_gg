"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";

import styles from "./site-ai-assistant.module.css";

type Message = Readonly<{ role: "USER" | "ASSISTANT"; text: string }>;
type PublicSettingsResponse = Readonly<{ settings?: { features?: { aiAssistant?: boolean } } }>;

function friendlyError(status: number, code?: string, detail?: string) {
  if (status === 401) return "로그인한 뒤 AI 도우미를 이용해 주세요.";
  if (status === 403 && code === "AI_DISABLED") return "AI 도우미가 현재 비활성화되어 있어요.";
  if (status === 403 && code === "AI_RATE_LIMITED") return "요청 한도에 도달했어요. 잠시 후 다시 이용해 주세요.";
  if (status === 403 && code === "AI_COST_LIMITED") return "오늘의 AI 비용 한도에 도달했어요.";
  return detail || "답변을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function SiteAiAssistant() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [revision, setRevision] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/site-settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as PublicSettingsResponse;
        if (response.ok && body.settings?.features?.aiAssistant === true) {
          setEnabled(true);
          setRevision(response.headers.get("ETag"));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!enabled) return null;

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !revision) return;
    const data = new FormData(event.currentTarget);
    const prompt = String(data.get("prompt") ?? "").normalize("NFKC").trim();
    if (!prompt || prompt.length > 1_800) return;
    setMessages((current) => [...current, { role: "USER", text: prompt }]);
    setBusy(true);
    event.currentTarget.reset();
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `site-ai-${crypto.randomUUID()}`,
          "If-Match": revision,
        },
        body: JSON.stringify({ prompt: `[현재 화면: ${pathname}] ${prompt}` }),
      });
      const body = await response.json() as { answer?: string; code?: string; detail?: string };
      const nextRevision = response.headers.get("ETag");
      if (nextRevision) setRevision(nextRevision);
      setMessages((current) => [...current, {
        role: "ASSISTANT",
        text: response.ok && body.answer ? body.answer : friendlyError(response.status, body.code, body.detail),
      }]);
    } catch {
      setMessages((current) => [...current, { role: "ASSISTANT", text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={styles.root} aria-label="K-LOL.GG AI 도우미">
      {open ? (
        <section className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="site-ai-title">
          <header>
            <div><Sparkles aria-hidden="true" /><span><strong id="site-ai-title">K-LOL 도우미</strong><small>현재 화면을 기준으로 안내해요</small></span></div>
            <button type="button" onClick={close} aria-label="AI 도우미 닫기"><X aria-hidden="true" /></button>
          </header>
          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 ? <p className={styles.welcome}>무엇을 찾고 있나요? 기능 위치나 이용 방법을 물어보세요.</p> : messages.map((message, index) => (
              <p key={`${message.role}-${index}`} data-role={message.role}><span>{message.role === "USER" ? "나" : "도우미"}</span>{message.text}</p>
            ))}
            {busy ? <p data-role="ASSISTANT"><span>도우미</span>답변을 준비하고 있어요…</p> : null}
          </div>
          <form onSubmit={submit}>
            <label htmlFor="site-ai-prompt">질문</label>
            <textarea ref={inputRef} id="site-ai-prompt" name="prompt" maxLength={1_800} rows={2} required placeholder="예: 내 경기 접수는 어디에서 확인해?" />
            <button type="submit" disabled={busy || !revision} aria-label="질문 보내기"><Send aria-hidden="true" /></button>
          </form>
          <small className={styles.privacy}>입력 내용은 답변 생성 외 용도로 저장하지 않으며, 정확한 운영 상태는 해당 화면에서 확인해 주세요.</small>
        </section>
      ) : null}
      <button ref={triggerRef} className={styles.trigger} type="button" onClick={() => setOpen(true)} aria-label="K-LOL.GG AI 도우미 열기" aria-expanded={open}>
        <Bot aria-hidden="true" /><span>도우미</span>
      </button>
    </aside>
  );
}
