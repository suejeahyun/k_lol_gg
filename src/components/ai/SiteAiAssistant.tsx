"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./SiteAiAssistant.module.css";

type Message = {
  role: "user" | "assistant";
  content: string;
  mode?: "openai" | "fallback";
};

type PublicSiteSettings = {
  planStatus: "ACTIVE" | "LOCKED";
  aiAssistantEnabled?: boolean;
  userAssistantName?: string;
  adminAssistantName?: string;
};

type AuthMeResponse = {
  user?: {
    role?: string;
    status?: string;
    player?: { id?: number | null } | null;
  } | null;
};

const adminQuickPrompts = [
  "오늘 운영 요약해줘",
  "최근 내전 흐름 분석해줘",
  "구인 현황에서 먼저 봐야 할 것 알려줘",
  "멸망전 진행 상태 점검해줘",
  "팀 밸런스 관점으로 위험 요소 알려줘",
];

const userQuickPrompts = [
  "내 시즌 기록 요약해줘",
  "최근 내전 흐름 알려줘",
  "현재 랭킹 흐름 알려줘",
  "멸망전 공개 진행 상태 알려줘",
  "내 기록에서 개선할 점 알려줘",
];

function isAdminRole(role?: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function getScope(message: string, adminMode: boolean) {
  if (!adminMode) {
    if (message.includes("멸망전") || message.includes("경매")) return "destruction";
    if (message.includes("밸런스") || message.includes("랭킹") || message.includes("MMR")) return "balance";
    if (message.includes("내전") || message.includes("경기")) return "match";
    if (message.includes("내 ") || message.includes("기록") || message.includes("플레이어")) return "player";
    return "general";
  }

  if (message.includes("구인")) return "recruit";
  if (message.includes("멸망전") || message.includes("경매")) return "destruction";
  if (message.includes("밸런스") || message.includes("랭킹") || message.includes("MMR")) return "balance";
  if (message.includes("내전") || message.includes("경기")) return "match";
  return "general";
}

export default function SiteAiAssistant() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootChecked, setBootChecked] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [assistantNames, setAssistantNames] = useState({
    user: "K-LOL 코치",
    admin: "AI 운영 비서",
  });
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const adminMode = isAdminRole(role ?? undefined);
  const isAdminPath = pathname?.startsWith("/admin") ?? false;
  const assistantTitle = adminMode ? assistantNames.admin : assistantNames.user;
  const assistantEyebrow = adminMode ? "SITE AI OPERATOR" : "K-LOL PERSONAL COACH";
  const quickPrompts = adminMode ? adminQuickPrompts : userQuickPrompts;

  const history = useMemo(
    () =>
      messages
        .filter((message) => message.content.trim())
        .slice(-6)
        .map(({ role, content }) => ({ role, content })),
    [messages],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const response = await fetch("/api/site-settings", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as {
          settings?: PublicSiteSettings;
        };
        const authResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const authData = (await authResponse.json().catch(() => ({}))) as AuthMeResponse;
        if (cancelled) return;
        const approved = authData.user?.status === "APPROVED";
        setRole(approved ? authData.user?.role ?? "USER" : null);
        setAssistantNames({
          user: data.settings?.userAssistantName || "K-LOL 코치",
          admin: data.settings?.adminAssistantName || "AI 운영 비서",
        });
        setEnabled(Boolean(approved && data.settings?.planStatus === "ACTIVE" && data.settings?.aiAssistantEnabled));
      } catch {
        if (!cancelled) setEnabled(false);
      } finally {
        if (!cancelled) setBootChecked(true);
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, loading, open]);

  async function sendMessage(content: string) {
    const message = content.trim();
    if (!message || loading) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          scope: getScope(message, adminMode),
          page: {
            pathname,
            search: typeof window === "undefined" ? "" : window.location.search.slice(1),
            title: typeof document === "undefined" ? "" : document.title,
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        answer?: string;
        message?: string;
        mode?: "openai" | "fallback";
      };

      if (!response.ok) {
        throw new Error(data.message || "AI 운영 비서가 응답하지 못했습니다.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer || "응답이 비어 있습니다.",
          mode: data.mode,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "AI 운영 비서 연결 중 오류가 발생했습니다.",
          mode: "fallback",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(input);
  }

  if (!bootChecked || !enabled) return null;

  return (
    <aside
      className={`${styles.root}${isAdminPath ? ` ${styles.adminRoot}` : ""}`}
      aria-label={assistantTitle}
    >
      {open ? (
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <span className={styles.eyebrow}>{assistantEyebrow}</span>
              <h2 className={styles.title}>{assistantTitle}</h2>
            </div>
            <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="닫기">
              x
            </button>
          </header>

          <div className={styles.quickActions} role="group" aria-label="빠른 질문">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => sendMessage(prompt)} disabled={loading}>
                {prompt}
              </button>
            ))}
          </div>

          <div className={styles.messages} ref={messagesRef}>
            {messages.length === 0 ? (
              <div className={styles.empty}>
                {adminMode
                  ? "운영 요약, 구인 상태, 팀 밸런스, 멸망전 진행 상황을 현재 DB 기준으로 물어볼 수 있습니다."
                  : "내 기록, 공개 랭킹, 최근 내전, 멸망전 공개 진행 상태를 기준으로 물어볼 수 있습니다."}
              </div>
            ) : (
              messages.map((message, index) => (
                <div className={styles.bubble} data-role={message.role} key={`${message.role}-${index}`}>
                  {message.content}
                </div>
              ))
            )}
            {loading ? (
              <div className={styles.bubble} data-role="assistant">
                운영 데이터를 읽고 답변을 준비하는 중...
              </div>
            ) : null}
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <input
              className={styles.input}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={2000}
              placeholder={adminMode ? "예: 오늘 먼저 처리할 운영 이슈 알려줘" : "예: 내 기록에서 개선할 점 알려줘"}
              aria-label={`${assistantTitle} 질문 입력`}
            />
            <button className={styles.send} type="submit" disabled={loading || !input.trim()}>
              전송
            </button>
          </form>
        </div>
      ) : (
        <button className={styles.launcher} type="button" onClick={() => setOpen(true)}>
          <span className={styles.launcherIcon}>{adminMode ? "AI" : "K"}</span>
          <span>{assistantTitle}</span>
        </button>
      )}
    </aside>
  );
}
