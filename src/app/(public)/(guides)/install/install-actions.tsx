"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import styles from "../guide.module.css";

type InstallPromptEvent = Event & Readonly<{
  prompt: () => Promise<void>;
  userChoice: Promise<Readonly<{ outcome: "accepted" | "dismissed" }>>;
}>;

type InstallState = "checking" | "installed" | "ios" | "ready" | "unavailable" | "dismissed";

export function InstallActions() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>("checking");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iPad|iPhone|iPod/u.test(window.navigator.userAgent);
    const frame = window.requestAnimationFrame(() => setState(standalone ? "installed" : ios ? "ios" : "unavailable"));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setState("ready");
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setState("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    setState(choice.outcome === "accepted" ? "installed" : "dismissed");
  }

  const message = {
    checking: "이 브라우저에서 설치 가능 여부를 확인하고 있어요.",
    installed: "이 기기에는 이미 앱 형태로 설치되어 있어요.",
    ios: "Safari 공유 메뉴에서 ‘홈 화면에 추가’를 선택해 주세요.",
    ready: "브라우저가 안전한 앱 설치를 지원합니다.",
    unavailable: "현재 브라우저에서는 설치 버튼을 제공할 수 없습니다. 웹사이트는 그대로 이용할 수 있어요.",
    dismissed: "설치를 취소했습니다. 브라우저가 다시 허용하면 이 페이지에서 재시도할 수 있어요.",
  }[state];

  return (
    <div aria-live="polite">
      <button className={styles.installButton} type="button" onClick={install} disabled={state !== "ready"}>
        <Download size={16} aria-hidden="true" /> 브라우저 앱 설치
      </button>
      <p className={styles.installStatus}>{message}</p>
    </div>
  );
}
