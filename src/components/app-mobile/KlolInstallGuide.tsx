"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Platform = "android-apk" | "android-pwa" | "iphone";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type ReleaseInfo = {
  available: boolean;
  channel?: "debug" | "release" | string;
  version: string;
  buildNumber: number;
  apkUrl: string | null;
  apkSize: string | null;
  updatedAt: string | null;
  minAndroidVersion: string;
  notes: string[];
};

const fallbackRelease: ReleaseInfo = {
  available: false,
  channel: "none",
  version: "준비 중",
  buildNumber: 0,
  apkUrl: null,
  apkSize: null,
  updatedAt: null,
  minAndroidVersion: "Android 8.0+",
  notes: ["APK 빌드 후 이 영역에 최신 다운로드 버튼이 자동으로 표시됩니다."],
};

const installTracks: Record<
  Platform,
  {
    label: string;
    badge: string;
    title: string;
    lead: string;
    primary: string;
    steps: Array<{ title: string; body: string; visual: string; hint: string }>;
    caution: string[];
  }
> = {
  "android-apk": {
    label: "Android APK",
    badge: "직접 설치",
    title: "APK 파일로 설치",
    lead: "스토어 없이 APK 파일을 내려받아 설치합니다. 갤럭시/Android 사용자에게 가장 앱다운 방식입니다.",
    primary: "APK 다운로드",
    steps: [
      {
        title: "APK 다운로드",
        body: "이 페이지의 APK 다운로드 버튼을 눌러 최신 K-LOL.GG 앱 파일을 받습니다.",
        visual: "APK",
        hint: "카카오톡 내부 브라우저에서 다운로드가 막히면 Chrome으로 다시 열어주세요.",
      },
      {
        title: "설치 허용",
        body: "처음 설치할 때 Android가 보안 안내를 띄우면 ‘알 수 없는 앱 설치 허용’을 켭니다.",
        visual: "허용",
        hint: "K-LOL.GG APK는 서버 주소만 담고, DB/API 키는 앱 안에 들어가지 않습니다.",
      },
      {
        title: "앱 실행",
        body: "홈 화면 또는 앱 목록의 K-LOL.GG 아이콘을 눌러 `/app` 모바일 화면으로 실행합니다.",
        visual: "K",
        hint: "업데이트가 나오면 새 APK를 다시 내려받아 설치합니다.",
      },
    ],
    caution: [
      "스토어 배포가 아니므로 설치 중 Android 보안 안내가 나올 수 있습니다.",
      "APK 업데이트는 자동이 아니라 새 파일을 다시 설치하는 방식입니다.",
      "공식 링크가 아닌 곳에서 받은 APK는 설치하지 않도록 안내하세요.",
    ],
  },
  "android-pwa": {
    label: "Android 홈화면",
    badge: "Chrome 대체",
    title: "Chrome 홈 화면에 추가",
    lead: "APK 설치가 부담스러운 사용자는 Chrome에서 홈 화면에 추가해 앱처럼 사용할 수 있습니다.",
    primary: "Android 설치 시도",
    steps: [
      {
        title: "Chrome으로 열기",
        body: "카카오톡 링크 화면 우측 상단 메뉴에서 ‘다른 브라우저로 열기’ 또는 ‘Chrome으로 열기’를 선택합니다.",
        visual: "⋮",
        hint: "카카오톡 내부 브라우저에서는 설치 배너가 숨겨질 수 있습니다.",
      },
      {
        title: "앱 설치 선택",
        body: "Chrome 주소창 또는 메뉴에서 ‘앱 설치’, ‘홈 화면에 추가’, ‘설치’를 선택합니다.",
        visual: "+",
        hint: "설치 배너가 뜨면 배너의 설치 버튼을 눌러도 됩니다.",
      },
      {
        title: "K-LOL.GG 실행",
        body: "홈 화면에 생성된 K-LOL.GG 아이콘을 눌러 주소창 없이 실행되는지 확인합니다.",
        visual: "K",
        hint: "주소창 없이 열리면 정상입니다.",
      },
    ],
    caution: [
      "설치 버튼이 안 보이면 Chrome 메뉴에서 홈 화면에 추가를 찾으세요.",
      "이미 설치한 아이콘이 이상하면 삭제 후 다시 추가하세요.",
      "APK보다 가볍지만 일부 Android 기기에서는 브라우저 정책을 따릅니다.",
    ],
  },
  iphone: {
    label: "iPhone Safari",
    badge: "무료 설치",
    title: "Safari 홈 화면에 추가",
    lead: "iPhone은 스토어 없이 Safari에서 홈 화면에 추가하는 방식이 무료 배포의 정답입니다.",
    primary: "iPhone 안내 복사",
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
      "iPhone은 APK처럼 파일 설치가 불가능하므로 Safari 홈 화면 추가를 사용합니다.",
      "로그인이 풀리면 Safari에서 다시 로그인 후 홈 화면 아이콘으로 사용하세요.",
      "정식 App Store 출시 비용 없이 사용할 수 있는 방식입니다.",
    ],
  },
};

function formatReleaseDate(value: string | null) {
  if (!value) return "빌드 전";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function KlolInstallGuide() {
  const [platform, setPlatform] = useState<Platform>("android-apk");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [release, setRelease] = useState<ReleaseInfo>(fallbackRelease);
  const [message, setMessage] = useState("");
  const guide = installTracks[platform];

  const installUrl = useMemo(() => {
    if (typeof window === "undefined") return "https://k-lol-gg.vercel.app/install";
    return `${window.location.origin}/install`;
  }, []);

  const apkDirectUrl = useMemo(() => {
    if (typeof window === "undefined") return "https://k-lol-gg.vercel.app/apk";
    return `${window.location.origin}/apk`;
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/downloads/android/latest.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("release metadata not found");
        return response.json() as Promise<ReleaseInfo>;
      })
      .then((data) => {
        if (!cancelled) setRelease({ ...fallbackRelease, ...data });
      })
      .catch(() => {
        if (!cancelled) setRelease(fallbackRelease);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const tryInstall = useCallback(async () => {
    if (!installPrompt) {
      setMessage("설치 버튼이 안 뜨면 Chrome 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted" ? "설치 요청이 완료되었습니다." : "설치가 취소되었습니다.");
  }, [installPrompt]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(installUrl);
      setMessage("설치 안내 링크를 복사했습니다.");
    } catch {
      setMessage("복사가 안 되면 주소창의 링크를 직접 복사하세요.");
    }
  }, [installUrl]);

  const copyApkLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apkDirectUrl);
      setMessage("APK 직접 다운로드 링크를 복사했습니다.");
    } catch {
      setMessage("복사가 안 되면 /apk 주소를 직접 공유하세요.");
    }
  }, [apkDirectUrl]);

  const copyIphoneGuide = useCallback(async () => {
    const text = [
      "iPhone 설치 방법",
      "1. Safari로 K-LOL.GG 접속",
      "2. 공유 버튼 선택",
      "3. 홈 화면에 추가 선택",
      installUrl,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setMessage("iPhone 설치 안내를 복사했습니다.");
    } catch {
      setMessage("복사가 안 되면 이 페이지 링크를 직접 공유하세요.");
    }
  }, [installUrl]);

  const handlePrimary = useCallback(() => {
    if (platform === "android-pwa") {
      void tryInstall();
      return;
    }

    if (platform === "iphone") {
      void copyIphoneGuide();
      return;
    }

    if (!release.available || !release.apkUrl) {
      setMessage("아직 APK 빌드 파일이 연결되지 않았습니다. Android 빌드 후 자동으로 다운로드 버튼이 활성화됩니다.");
      return;
    }

    window.location.href = release.apkUrl;
  }, [copyIphoneGuide, platform, release.apkUrl, release.available, tryInstall]);

  return (
    <main className="klol-install-page">
      <section className="klol-install-hero-card">
        <div className="klol-install-app-mark">K</div>
        <p className="klol-install-kicker">K-LOL.GG APP DISTRIBUTION</p>
        <h1>스토어 없이 앱처럼 사용하기</h1>
        <p className="klol-install-lead">
          Android는 APK 직접 설치, iPhone은 Safari 홈 화면 추가를 기본 배포 방식으로 사용합니다.
        </p>
        <div className="klol-install-select klol-install-select--three" role="group" aria-label="설치 방식 선택">
          {(Object.keys(installTracks) as Platform[]).map((key) => (
            <button
              type="button"
              className={platform === key ? "is-active" : ""}
              aria-pressed={platform === key}
              onClick={() => setPlatform(key)}
              key={key}
            >
              {installTracks[key].label}
            </button>
          ))}
        </div>
      </section>

      <section className="klol-install-release-card">
        <div>
          <span className={release.available ? "is-live" : ""}>
            {release.available ? `APK ${release.channel === "release" ? "RELEASE" : "TEST"}` : "APK 준비 중"}
          </span>
          <h2>Android APK 배포 상태</h2>
          <p>
            최신 버전 {release.version} · 빌드 {release.buildNumber || "-"} · {release.apkSize ?? "파일 없음"}
          </p>
        </div>
        <div className="klol-install-release-meta">
          <b>{release.minAndroidVersion}</b>
          <small>{formatReleaseDate(release.updatedAt)}</small>
        </div>
        {release.available ? (
          <div className="klol-install-release-download">
            <a href="/apk">최신 APK 바로 받기</a>
            <button type="button" onClick={copyApkLink}>APK 링크 복사</button>
          </div>
        ) : null}
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
                <b>
                  {index + 1}. {step.title}
                </b>
                <p>{step.body}</p>
                <small>{step.hint}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="klol-install-panel klol-install-warning-panel">
        <h2>배포 전 체크</h2>
        <div className="klol-install-warning-list">
          {guide.caution.map((item) => (
            <p key={item}>{item}</p>
          ))}
          {release.notes.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </section>

      <section className="klol-install-actions-panel">
        {platform === "android-apk" && release.available ? (
          <a className="klol-install-primary" href="/apk">
            {guide.primary}
          </a>
        ) : (
          <button type="button" className="klol-install-primary" onClick={handlePrimary}>
            {guide.primary}
          </button>
        )}
        <Link className="klol-install-secondary" href="/app">
          K-LOL.GG APP 열기
        </Link>
        <button type="button" className="klol-install-secondary" onClick={copyLink}>
          설치 링크 복사
        </button>
        {message ? <p className="klol-install-message" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
