"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Team = {
  id: number;
  name: string;
};

type TossSide = "A" | "B";
type TossPhase = "idle" | "spinning" | "revealed";
type SideChoice = "FIRST" | "SECOND";

type Props = {
  teamA: Team;
  teamB: Team;
  editableTeams?: boolean;
  className?: string;
};

const SOUND_PATHS = {
  shuffle: "/sounds/auction/auction-shuffle-whoosh.wav",
  flip: "/sounds/auction/auction-card-flip.wav",
  reveal: "/sounds/auction/auction-reveal-impact.wav",
};

function randomSide(): TossSide {
  if (typeof window === "undefined" || !window.crypto?.getRandomValues) {
    return Math.random() < 0.5 ? "A" : "B";
  }

  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0] % 2 === 0 ? "A" : "B";
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

function getChoiceLabel(choice: SideChoice | null) {
  if (choice === "FIRST") return "선공";
  if (choice === "SECOND") return "후공";
  return "선택 대기";
}

export default function DestructionCoinTossPanel({ teamA, teamB, editableTeams = false, className = "" }: Props) {
  const [phase, setPhase] = useState<TossPhase>("idle");
  const [winnerSide, setWinnerSide] = useState<TossSide | null>(null);
  const [choice, setChoice] = useState<SideChoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [teamAName, setTeamAName] = useState(teamA.name);
  const [teamBName, setTeamBName] = useState(teamB.name);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const displayTeamA = useMemo(() => ({ ...teamA, name: teamAName.trim() || "앞면 팀" }), [teamA, teamAName]);
  const displayTeamB = useMemo(() => ({ ...teamB, name: teamBName.trim() || "뒷면 팀" }), [teamB, teamBName]);

  const winnerTeam = useMemo(() => {
    if (winnerSide === "A") return displayTeamA;
    if (winnerSide === "B") return displayTeamB;
    return null;
  }, [displayTeamA, displayTeamB, winnerSide]);

  const tossLabel = winnerSide === "A" ? "앞면" : winnerSide === "B" ? "뒷면" : "대기";
  const resultText =
    phase === "spinning"
      ? "동전이 떨어지는 중..."
      : winnerTeam
        ? `${winnerTeam.name} ${getChoiceLabel(choice)}`
        : "코인토스를 실행해주세요.";

  const handleToss = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setCopied(false);
    setChoice(null);
    setWinnerSide(null);
    setPhase("spinning");
    playSound(SOUND_PATHS.shuffle, 0.25);

    timers.current.push(
      window.setTimeout(() => {
        playSound(SOUND_PATHS.flip, 0.38);
      }, 520),
    );

    timers.current.push(
      window.setTimeout(() => {
        playSound(SOUND_PATHS.flip, 0.24);
      }, 1780),
    );

    timers.current.push(
      window.setTimeout(() => {
        const nextWinner = randomSide();
        setWinnerSide(nextWinner);
        setPhase("revealed");
        playSound(SOUND_PATHS.reveal, 0.42);
      }, 2860),
    );
  };

  const handleChoice = (nextChoice: SideChoice) => {
    if (!winnerTeam) return;
    setChoice(nextChoice);
    setCopied(false);
    playSound(SOUND_PATHS.flip, 0.18);
  };

  const handleCopy = async () => {
    if (!winnerTeam) return;

    const text = [
      "[K-LOL 코인토스]",
      `${displayTeamA.name} vs ${displayTeamB.name}`,
      `결과: ${winnerTeam.name} (${tossLabel})`,
      `선택: ${getChoiceLabel(choice)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const panelClassName = [
    "destruction-coin-toss",
    className,
    `is-${phase}`,
    winnerSide === "A" ? "winner-a" : "",
    winnerSide === "B" ? "winner-b" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={panelClassName} aria-live="polite">
      <div className="destruction-coin-toss__header">
        <div>
          <span className="destruction-coin-toss__eyebrow">COIN TOSS</span>
          <h4>선후공 코인토스</h4>
        </div>
        <strong className="destruction-coin-toss__result">{resultText}</strong>
      </div>

      {editableTeams ? (
        <div className="destruction-coin-toss__inputs" aria-label="코인토스 팀명 설정">
          <label>
            <span>앞면</span>
            <input
              value={teamAName}
              onChange={(event) => setTeamAName(event.target.value)}
              placeholder="앞면 팀"
              maxLength={24}
            />
          </label>
          <label>
            <span>뒷면</span>
            <input
              value={teamBName}
              onChange={(event) => setTeamBName(event.target.value)}
              placeholder="뒷면 팀"
              maxLength={24}
            />
          </label>
        </div>
      ) : null}

      <div className="destruction-coin-toss__stage">
        <div className="destruction-coin-toss__team destruction-coin-toss__team--blue">
          <span>앞면</span>
          <strong>{displayTeamA.name}</strong>
        </div>

        <button
          type="button"
          className="destruction-coin-toss__coin"
          onClick={handleToss}
          disabled={phase === "spinning"}
          aria-label={`${displayTeamA.name} 앞면, ${displayTeamB.name} 뒷면 코인토스 실행`}
        >
          <span className="destruction-coin-toss__coin-disc">
            <span className="destruction-coin-toss__coin-face destruction-coin-toss__coin-face--front">
              <span>K</span>
              <small>앞</small>
            </span>
            <span className="destruction-coin-toss__coin-face destruction-coin-toss__coin-face--back">
              <span>LOL</span>
              <small>뒤</small>
            </span>
          </span>
        </button>

        <div className="destruction-coin-toss__team destruction-coin-toss__team--red">
          <span>뒷면</span>
          <strong>{displayTeamB.name}</strong>
        </div>
      </div>

      <div className="destruction-coin-toss__actions">
        <button
          type="button"
          className="destruction-coin-toss__primary"
          onClick={handleToss}
          disabled={phase === "spinning"}
        >
          {phase === "spinning" ? "던지는 중..." : winnerTeam ? "다시 던지기" : "코인토스 실행"}
        </button>
        <button
          type="button"
          className={choice === "FIRST" ? "destruction-coin-toss__choice is-active" : "destruction-coin-toss__choice"}
          onClick={() => handleChoice("FIRST")}
          disabled={!winnerTeam || phase === "spinning"}
        >
          선공 선택
        </button>
        <button
          type="button"
          className={choice === "SECOND" ? "destruction-coin-toss__choice is-active" : "destruction-coin-toss__choice"}
          onClick={() => handleChoice("SECOND")}
          disabled={!winnerTeam || phase === "spinning"}
        >
          후공 선택
        </button>
        <button
          type="button"
          className="destruction-coin-toss__copy"
          onClick={handleCopy}
          disabled={!winnerTeam}
        >
          {copied ? "복사됨" : "결과 복사"}
        </button>
      </div>
    </section>
  );
}
