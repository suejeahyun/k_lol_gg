"use client";

import { useRef, useState } from "react";

type Team = {
  id: number;
  name: string;
};

type TossSide = "front" | "back";
type TossPhase = "idle" | "playing" | "revealed";

type Props = {
  teamA?: Team;
  teamB?: Team;
  editableTeams?: boolean;
  className?: string;
  headingLevel?: "h1" | "h2";
};

const SOUND_PATHS = {
  reveal: "/sounds/auction/auction-reveal-impact.wav",
};

const VIDEO_PATHS: Record<TossSide, string> = {
  front: "/videos/coin-toss/coin-front.mp4",
  back: "/videos/coin-toss/coin-back.mp4",
};

function randomSide(): TossSide {
  if (typeof window === "undefined" || !window.crypto?.getRandomValues) {
    return Math.random() < 0.5 ? "front" : "back";
  }

  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0] % 2 === 0 ? "front" : "back";
}

function playSound(path: string, volume = 0.42) {
  try {
    const audio = new Audio(path);
    audio.volume = volume;
    void audio.play();
  } catch {
    // Browsers may block audio. The toss animation still works without sound.
  }
}

function sideLabel(side: TossSide | null) {
  if (side === "front") return "앞면";
  if (side === "back") return "뒷면";
  return "대기";
}

export default function DestructionCoinTossPanel({
  className = "",
  headingLevel = "h2",
}: Props) {
  const Heading = headingLevel;
  const [phase, setPhase] = useState<TossPhase>("idle");
  const [winnerSide, setWinnerSide] = useState<TossSide | null>(null);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const resultText =
    phase === "playing"
      ? "결과를 확인하는 중..."
      : winnerSide
        ? `${sideLabel(winnerSide)}이 나왔습니다.`
        : "코인토스를 실행해주세요.";

  const handleToss = () => {
    const nextWinner = randomSide();
    const nextVideoSrc = VIDEO_PATHS[nextWinner];

    setCopied(false);
    setWinnerSide(nextWinner);
    setActiveVideoSrc(nextVideoSrc);
    setPhase("playing");

    window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;

      video.pause();
      video.src = nextVideoSrc;
      video.currentTime = 0;
      video.load();

      void video.play().catch(() => {
        setPhase("revealed");
        playSound(SOUND_PATHS.reveal, 0.32);
      });
    });
  };

  const handleCopy = async () => {
    if (phase !== "revealed" || !winnerSide) return;

    try {
      await navigator.clipboard.writeText(["[K-LOL 코인토스]", `결과: ${sideLabel(winnerSide)}`].join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;

    try {
      if (frame.requestFullscreen) {
        await frame.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by the browser; normal playback remains available.
    }
  };

  const panelClassName = [
    "destruction-coin-toss",
    "destruction-coin-toss--simple",
    "destruction-coin-toss--video",
    className,
    `is-${phase}`,
    winnerSide === "front" ? "winner-front" : "",
    winnerSide === "back" ? "winner-back" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={panelClassName} aria-live="polite">
      <div className="destruction-coin-toss__header">
        <div>
          <span className="destruction-coin-toss__eyebrow">COIN TOSS</span>
          <Heading>코인토스</Heading>
        </div>
        <strong className="destruction-coin-toss__result">{resultText}</strong>
      </div>

      <div className="destruction-coin-toss__stage">
        <div className="destruction-coin-toss__video-frame" ref={frameRef}>
          <video
            ref={videoRef}
            className="destruction-coin-toss__video"
            src={activeVideoSrc ?? undefined}
            playsInline
            preload="auto"
            onEnded={() => {
              setPhase("revealed");
              playSound(SOUND_PATHS.reveal, 0.24);
            }}
            onError={() => setPhase("revealed")}
          />
          <button
            type="button"
            className="destruction-coin-toss__fullscreen"
            onClick={handleFullscreen}
            aria-label="코인토스 무대 전체 화면으로 보기"
          >
            전체 화면
          </button>
          {!activeVideoSrc && (
            <button
              type="button"
              className="destruction-coin-toss__video-placeholder"
              onClick={handleToss}
              aria-label="앞면 또는 뒷면 코인토스 실행"
            >
              <span>COIN TOSS</span>
              <strong>앞면 / 뒷면</strong>
            </button>
          )}
        </div>

        <div className="destruction-coin-toss__side-row" aria-hidden="true">
          <span className={phase === "revealed" && winnerSide === "front" ? "is-active" : ""}>앞면</span>
          <span className={phase === "revealed" && winnerSide === "back" ? "is-active" : ""}>뒷면</span>
        </div>
      </div>

      <div className="destruction-coin-toss__actions">
        <button
          type="button"
          className="destruction-coin-toss__primary"
          onClick={handleToss}
          disabled={phase === "playing"}
        >
          {phase === "playing" ? "재생 중..." : winnerSide ? "다시 던지기" : "코인토스 실행"}
        </button>
        <button
          type="button"
          className="destruction-coin-toss__copy"
          onClick={handleCopy}
          disabled={phase !== "revealed" || !winnerSide}
        >
          {copied ? "복사됨" : "결과 복사"}
        </button>
      </div>
    </section>
  );
}
