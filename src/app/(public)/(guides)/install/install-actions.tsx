"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "@/components/theme/theme-icons";

import styles from "../guide.module.css";

type InstallPromptEvent = Event & Readonly<{
  prompt: () => Promise<void>;
  userChoice: Promise<Readonly<{ outcome: "accepted" | "dismissed" }>>;
}>;

type InstallState = "checking" | "installed" | "ios" | "ready" | "installing" | "accepted" | "unavailable" | "dismissed" | "error";

export function InstallActions() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>("checking");
  const installing = useRef(false);
  const installed = useRef(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    installed.current = standalone;
    const ios = /iPad|iPhone|iPod/u.test(window.navigator.userAgent);
    const frame = window.requestAnimationFrame(() => setState((current) => current === "checking" ? standalone ? "installed" : ios ? "ios" : "unavailable" : current));
    const onPrompt = (event: Event) => {
      if (installed.current) return;
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      if (!installing.current) setState("ready");
    };
    const onInstalled = () => {
      installed.current = true;
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
    if (!promptEvent || installing.current || installed.current) return;
    installing.current = true;
    setPromptEvent(null);
    setState("installing");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (!installed.current) setState(choice.outcome === "accepted" ? "accepted" : "dismissed");
    } catch {
      if (!installed.current) setState("error");
    } finally {
      installing.current = false;
    }
  }

  const message = {
    checking: "이 브라우저에서 설치 가능 여부를 확인하고 있어요.",
    installed: "이 기기에는 이미 앱 형태로 설치되어 있어요.",
    ios: "Safari 공유 메뉴에서 ‘홈 화면에 추가’를 선택해 주세요.",
    ready: "설치 가능",
    installing: "설치 창에서 응답을 기다리고 있습니다.",
    accepted: "설치 요청을 전달했습니다. 브라우저에서 완료를 확인해 주세요.",
    unavailable: "현재 브라우저에서는 설치 버튼을 제공할 수 없습니다. 웹사이트는 그대로 이용할 수 있어요.",
    dismissed: "설치를 취소했습니다. 브라우저가 다시 허용하면 이 페이지에서 재시도할 수 있어요.",
    error: "설치 창을 열지 못했습니다. 브라우저 메뉴의 ‘앱 설치’를 이용하거나 설치 버튼이 활성화되면 다시 시도해 주세요.",
  }[state];

  return (
    <div aria-live="polite">
      <button className={styles.installButton} type="button" onClick={install} disabled={state !== "ready"}>
        <Download size={16} aria-hidden="true" /> 브라우저 앱 설치
      </button>
      <p className={styles.installStatus} role={state === "error" ? "alert" : "status"}>{message}</p>
    </div>
  );
}
