"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function AppInstallActions() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "https://k-lol-gg.vercel.app/install";
    return `${window.location.origin}/install`;
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) {
      setMessage("설치 버튼이 보이지 않으면 Chrome/Safari로 열어 홈 화면에 추가하세요.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted" ? "설치 요청이 완료되었습니다." : "설치가 취소되었습니다.");
  }, [installPrompt]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setMessage("설치 안내 링크를 복사했습니다.");
    } catch {
      setMessage("복사가 안 되면 주소창의 링크를 직접 복사하세요.");
    }
  }, [appUrl]);

  return (
    <div className="klol-app-install-actions">
      <button type="button" className="klol-app-primary" onClick={install}>
        Android 앱 설치 시도
      </button>
      <button type="button" className="klol-app-secondary" onClick={copy}>
        설치 링크 복사
      </button>
      {message ? <p className="klol-app-install-message">{message}</p> : null}
    </div>
  );
}
