"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Platform = "android" | "iphone";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_URL = "https://k-lol-gg.vercel.app/install";

const guides: Record<Platform, {
  label: string;
  badge: string;
  title: string;
  lead: string;
  steps: Array<{ title: string; body: string; visual: string; hint: string }>;
  caution: string[];
}> = {
  android: {
    label: "Android 설치",
    badge: "Chrome 권장",
    title: "Android 홈 화면에 추가",
    lead: "카카오톡에서 바로 설치 버튼이 안 보이면 Chrome으로 다시 연 뒤 홈 화면에 추가하세요.",
    steps: [
      {
        title: "Chrome으로 열기",
        body: "카카오톡 링크 화면 우측 상단 메뉴를 누르고 ‘다른 브라우저로 열기’ 또는 ‘Chrome으로 열기’를 선택합니다.",
        visual: "⋮",
        hint: "카카오톡 내부 브라우저에서는 설치 버튼이 숨겨질 수 있습니다.",
      },
      {
        title: "앱 설치 선택",
        body: "Chrome 주소창 또는 메뉴에서 ‘앱 설치’, ‘홈 화면에 추가’, ‘설치’를 선택합니다.",
        visual: "+",
        hint: "설치 배너가 뜨면 배너의 설치 버튼을 눌러도 됩니다.",
      },
      {
        title: "K-LOL.GG 실행",
        body: "휴대폰 홈 화면에 생성된 K-LOL.GG 아이콘을 눌러 앱처럼 실행합니다.",
        visual: "K",
        hint: "주소창 없이 열리면 정상입니다.",
      },
    ],
    caution: [
      "카카오톡 내부 브라우저에서는 설치 버튼이 안 보일 수 있습니다.",
      "설치가 안 보이면 Chrome 메뉴에서 홈 화면에 추가를 찾으세요.",
      "이미 설치한 아이콘이 이상하면 삭제 후 다시 추가하세요.",
    ],
  },
  iphone: {
    label: "iPhone 설치",
    badge: "Safari 필수",
    title: "iPhone 홈 화면에 추가",
    lead: "iPhone은 Safari에서 공유 버튼을 통해 홈 화면에 추가해야 가장 안정적입니다.",
    steps: [
      {
        title: "Safari로 열기",
        body: "카카오톡 링크 화면에서 우측 상단 메뉴를 누르고 Safari로 열어주세요.",
        visual: "↗",
        hint: "카카오톡 내부 브라우저에서는 홈 화면 추가 메뉴가 제한될 수 있습니다.",
      },
      {
        title: "공유 버튼 선택",
        body: "Safari 하단 또는 상단의 공유 버튼을 누릅니다.",
        visual: "□↑",
        hint: "공유 버튼은 네모에서 위쪽 화살표가 나가는 모양입니다.",
      },
      {
        title: "홈 화면에 추가",
        body: "목록에서 ‘홈 화면에 추가’를 선택하고 우측 상단 ‘추가’를 누릅니다.",
        visual: "+",
        hint: "홈 화면에 K-LOL.GG 아이콘이 생기면 완료입니다.",
      },
    ],
    caution: [
      "iPhone은 Chrome이 아니라 Safari에서 홈 화면 추가를 진행하는 것이 좋습니다.",
      "카카오톡 내부 브라우저에서는 공유 메뉴가 다르게 보일 수 있습니다.",
      "로그인이 풀리면 홈 화면 아이콘이 아닌 Safari에서 다시 로그인 후 사용하세요.",
    ],
  },
};

export default function KlolInstallGuide() {
  const [platform, setPlatform] = useState<Platform>("android");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const guide = guides[platform];

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const tryInstall = useCallback(async () => {
    if (!installPrompt) {
      setMessage(platform === "android" ? "설치 버튼이 안 뜨면 Chrome 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요." : "iPhone은 Safari 공유 버튼에서 ‘홈 화면에 추가’를 선택하세요.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted" ? "설치 요청이 완료되었습니다." : "설치가 취소되었습니다.");
  }, [installPrompt, platform]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_URL);
      setMessage("설치 안내 링크를 복사했습니다.");
    } catch {
      setMessage("복사가 안 되면 주소창의 링크를 직접 복사하세요.");
    }
  }, []);

  return (
    <main className="klol-install-page">
      <section className="klol-install-hero-card">
        <div className="klol-install-app-mark">K</div>
        <p className="klol-install-kicker">K-LOL.GG APP</p>
        <h1>홈 화면 추가 안내</h1>
        <p className="klol-install-lead">휴대폰 기종을 선택하면 해당 방법만 보여줍니다.</p>
        <div className="klol-install-select" role="tablist" aria-label="설치 기기 선택">
          <button type="button" className={platform === "android" ? "is-active" : ""} onClick={() => setPlatform("android")}>
            Android
          </button>
          <button type="button" className={platform === "iphone" ? "is-active" : ""} onClick={() => setPlatform("iphone")}>
            iPhone
          </button>
        </div>
      </section>

      <section className="klol-install-panel">
        <div className="klol-install-panel-head">
          <span>{guide.badge}</span>
          <h2>{guide.title}</h2>
          <p>{guide.lead}</p>
        </div>

        <div className="klol-install-photo-list">
          {guide.steps.map((step, index) => (
            <article className="klol-install-photo-card" key={step.title}>
              <div className="klol-install-phone-shot" aria-hidden="true">
                <div className="klol-install-phone-top" />
                <div className="klol-install-phone-screen">
                  <span className="klol-install-step-number">{index + 1}</span>
                  <strong>{step.visual}</strong>
                  <em>{step.title}</em>
                </div>
              </div>
              <div className="klol-install-step-copy">
                <b>{index + 1}. {step.title}</b>
                <p>{step.body}</p>
                <small>{step.hint}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="klol-install-panel klol-install-warning-panel">
        <h2>주의사항</h2>
        <div className="klol-install-warning-list">
          {guide.caution.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </section>

      <section className="klol-install-actions-panel">
        {platform === "android" ? (
          <button type="button" className="klol-install-primary" onClick={tryInstall}>Android 설치 시도</button>
        ) : null}
        <Link className="klol-install-primary" href="/app">K-LOL.GG APP 열기</Link>
        <button type="button" className="klol-install-secondary" onClick={copyLink}>설치 링크 복사</button>
        {message ? <p className="klol-install-message">{message}</p> : null}
      </section>
    </main>
  );
}
