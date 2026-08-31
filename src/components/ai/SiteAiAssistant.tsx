"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./SiteAiAssistant.module.css";
import { loadPublicSiteSettings } from "@/lib/site/public-settings-client";

type Message = {
  role: "user" | "assistant";
  content: string;
  mode?: "openai" | "fallback";
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
  const [statusCheckFailed, setStatusCheckFailed] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [assistantNames, setAssistantNames] = useState({
    user: "K-LOL 코치",
    admin: "AI 운영 비서",
  });
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const hasOpenedRef = useRef(false);
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
        const [settings, authResponse] = await Promise.all([
          loadPublicSiteSettings(),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);
        const authData = (await authResponse.json().catch(() => ({}))) as AuthMeResponse;
        if (cancelled) return;
        const approved = authData.user?.status === "APPROVED";
        setRole(approved ? authData.user?.role ?? "USER" : null);
        setAssistantNames({
          user: settings.userAssistantName || "K-LOL 코치",
          admin: settings.adminAssistantName || "AI 운영 비서",
        });
        setEnabled(Boolean(approved && settings.planStatus === "ACTIVE" && settings.aiAssistantEnabled));
      } catch {
        if (!cancelled) {
          setEnabled(false);
          setStatusCheckFailed(true);
        }
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

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
      const focusFrame = window.requestAnimationFrame(() => {
        (closeButtonRef.current ?? panelRef.current)?.focus();
      });
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        setOpen(false);
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        window.cancelAnimationFrame(focusFrame);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }

    if (!hasOpenedRef.current) return;
    const focusFrame = window.requestAnimationFrame(() => {
      (launcherRef.current ?? returnFocusRef.current)?.focus();
      returnFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [open]);

  function openPanel() {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
  }

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

  const unavailableTitle = !bootChecked
    ? "AI 기능 상태를 확인하는 중입니다"
    : statusCheckFailed
      ? "AI 기능 상태를 확인하지 못했습니다"
      : adminMode
        ? "AI 운영 비서 기능을 잠시 사용할 수 없습니다"
        : "AI 코치 기능을 잠시 사용할 수 없습니다";
  const unavailableDescription = !bootChecked
    ? "안전한 이용 가능 상태를 확인할 때까지 AI 요청을 보내지 않습니다."
    : statusCheckFailed
      ? adminMode
        ? "안전을 위해 AI 요청을 보내지 않았습니다. 운영 화면은 계속 이용할 수 있습니다."
        : "안전을 위해 AI 요청을 보내지 않았습니다. 다른 기능은 계속 이용할 수 있습니다."
      : adminMode
        ? "개인정보 보호 기준과 보관 정책을 정비하는 동안 AI 답변 기능을 일시 중단했습니다. 기존 운영 화면과 통계는 계속 이용할 수 있습니다."
        : "개인정보 보호 기준과 보관 정책을 정비하는 동안 AI 답변 기능을 일시 중단했습니다. 플레이어 검색과 전적·랭킹은 계속 이용할 수 있습니다.";

  return (
    <aside
      className={`${styles.root}${isAdminPath ? ` ${styles.adminRoot}` : ""}`}
      aria-label={assistantTitle}
    >
      {open ? (
        <div
          className={styles.panel}
          id="site-ai-assistant-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="site-ai-assistant-title"
          aria-describedby={!enabled ? "site-ai-assistant-description" : undefined}
          tabIndex={-1}
        >
          <header className={styles.header}>
            <div>
              <span className={styles.eyebrow}>{assistantEyebrow}</span>
              <h2 className={styles.title} id="site-ai-assistant-title">
                {enabled ? assistantTitle : unavailableTitle}
              </h2>
            </div>
            <button
              className={styles.close}
              type="button"
              ref={closeButtonRef}
              onClick={closePanel}
              aria-label="AI 안내 닫기"
            >
              x
            </button>
          </header>

          {!enabled ? (
            <div className={styles.unavailable} role={statusCheckFailed ? "alert" : "status"}>
              <p id="site-ai-assistant-description">{unavailableDescription}</p>
              {bootChecked ? (
                <div className={styles.unavailableActions}>
                  <Link href={adminMode ? "/admin" : "/players"}>
                    {adminMode ? "운영 대시보드로" : "플레이어 검색"}
                  </Link>
                  <Link href={adminMode ? "/admin/matches" : "/matches"}>
                    {adminMode ? "내전 관리 보기" : "최근 내전 보기"}
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {enabled ? <div className={styles.quickActions} role="group" aria-label="빠른 질문">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => sendMessage(prompt)} disabled={loading}>
                {prompt}
              </button>
            ))}
          </div> : null}

          {enabled ? <div className={styles.messages} ref={messagesRef}>
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
          </div> : null}

          {enabled ? <form className={styles.form} onSubmit={handleSubmit}>
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
          </form> : null}
        </div>
      ) : (
        <button
          className={styles.launcher}
          type="button"
          ref={launcherRef}
          onClick={openPanel}
          aria-expanded={open}
          aria-controls="site-ai-assistant-panel"
          aria-label={`${assistantTitle}, 현재 ${enabled ? "사용 가능" : "준비 중"}, 안내 열기`}
        >
          <span className={styles.launcherIcon}>{adminMode ? "AI" : "K"}</span>
          <span>{assistantTitle}{enabled ? "" : " · 준비 중"}</span>
        </button>
      )}
    </aside>
  );
}
