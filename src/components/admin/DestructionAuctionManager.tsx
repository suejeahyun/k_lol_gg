"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type AuctionStatus = "PENDING" | "DRAWN" | "SOLD" | "HOLD" | "ASSIGNED";
type DrawPhase =
  | "IDLE"
  | "SHUFFLING"
  | "SELECTING"
  | "APPROACHING"
  | "TIER_ASCENDING"
  | "SPECIAL_TENSION"
  | "FLIPPING"
  | "REVEALED";

type FlipDrawBridgeState = {
  left: number;
  top: number;
  width: number;
  height: number;
  cardIndex: number;
  rotation: number;
  startScale: number;
};
type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier?: string | null;
  peakTier?: string | null;
};

type Participant = {
  id: number;
  playerId: number;
  teamId: number | null;
  position: Position;
  isCaptain: boolean;
  auctionStatus: AuctionStatus;
  purchasePoint: number | null;
  drawOrder: number | null;
  subPositions?: string[];
  message?: string | null;
  player: Player;
  team?: { id: number; name: string } | null;
};

type Team = {
  id: number;
  name: string;
  captainId: number;
  points: number;
  wins: number;
  losses: number;
  initialAuctionPoints: number;
  remainingAuctionPoints: number;
  captain: Player;
  members: Participant[];
};

type Props = {
  tournamentId: number;
  teams: Team[];
  participants: Participant[];
  hasMatches: boolean;
  liveMode?: boolean;
};

type TierVisual = {
  key: string;
  primary: string;
  secondary: string;
  glow: string;
  border: string;
  textGlow: string;
  accent: string;
  highTier: boolean;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const SHUFFLE_NEUTRAL_TIER_VISUAL: TierVisual = {
  key: "SHUFFLE",
  primary: "#3b82f6",
  secondary: "#0f172a",
  glow: "rgba(59,130,246,0.42)",
  border: "rgba(96,165,250,0.85)",
  textGlow: "rgba(59,130,246,0.34)",
  accent: "rgba(255,255,255,0.14)",
  highTier: false,
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AuctionSoundName =
  | "shuffleTick"
  | "select"
  | "confirm"
  | "tierStep"
  | "diamondTension"
  | "masterTension"
  | "flip"
  | "reveal";

type AuctionSoundWindow = typeof window & {
  __klolAuctionAudioContext?: AudioContext;
  __klolAuctionAssetCache?: Partial<Record<AuctionSoundName, HTMLAudioElement>>;
};

const AUCTION_SOUND_PATHS: Record<AuctionSoundName, string> = {
  shuffleTick: "/sounds/auction/auction-shuffle-whoosh.wav",
  select: "/sounds/auction/auction-player-select.wav",
  confirm: "/sounds/auction/auction-player-confirm.wav",
  tierStep: "/sounds/auction/auction-tier-step.wav",
  diamondTension: "/sounds/auction/auction-diamond-tension.wav",
  masterTension: "/sounds/auction/auction-master-tension.wav",
  flip: "/sounds/auction/auction-card-flip.wav",
  reveal: "/sounds/auction/auction-reveal-impact.wav",
};

const AUCTION_SOUND_VOLUME: Record<AuctionSoundName, number> = {
  shuffleTick: 0.2,
  select: 0.22,
  confirm: 0.14,
  tierStep: 0.14,
  diamondTension: 0.12,
  masterTension: 0.1,
  flip: 0.18,
  reveal: 0.22,
};

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;
  const soundWindow = window as AuctionSoundWindow;
  if (!soundWindow.__klolAuctionAudioContext)
    soundWindow.__klolAuctionAudioContext = new AudioContextCtor();
  return soundWindow.__klolAuctionAudioContext;
}

function preloadAuctionSoundAssets() {
  if (typeof window === "undefined") return;
  const soundWindow = window as AuctionSoundWindow;
  if (!soundWindow.__klolAuctionAssetCache) soundWindow.__klolAuctionAssetCache = {};

  (Object.keys(AUCTION_SOUND_PATHS) as AuctionSoundName[]).forEach((name) => {
    if (soundWindow.__klolAuctionAssetCache?.[name]) return;
    const audio = new Audio(AUCTION_SOUND_PATHS[name]);
    audio.preload = "auto";
    audio.volume = AUCTION_SOUND_VOLUME[name];
    soundWindow.__klolAuctionAssetCache![name] = audio;
    audio.load();
  });
}

async function unlockAuctionAudio() {
  preloadAuctionSoundAssets();
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
}

function playTone(
  ctx: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = "sine",
  destination: AudioNode = ctx.destination,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(gainValue, 0.0001),
    at + 0.012,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.025);
}

function playNoise(
  ctx: AudioContext,
  at: number,
  duration: number,
  gainValue: number,
  filterFrequency: number,
) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1)
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(filterFrequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(gainValue, 0.0001),
    at + 0.008,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(at);
  source.stop(at + duration + 0.02);
}

function playGeneratedAuctionSound(name: AuctionSoundName, enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state === "suspended") return;
  const now = ctx.currentTime;

  if (name === "shuffleTick") {
    playNoise(ctx, now, 0.18, 0.006, 2800);
    playNoise(ctx, now + 0.08, 0.16, 0.005, 3200);
    playNoise(ctx, now + 0.16, 0.14, 0.0045, 3600);
    return;
  }
  if (name === "select") {
    playNoise(ctx, now, 0.16, 0.007, 2600);
    playNoise(ctx, now + 0.16, 0.05, 0.006, 4200);
    return;
  }
  if (name === "confirm") {
    playNoise(ctx, now, 0.06, 0.006, 2400);
    return;
  }
  if (name === "tierStep") {
    playTone(ctx, now, 1175, 0.12, 0.007, "sine");
    playTone(ctx, now + 0.025, 1760, 0.14, 0.004, "triangle");
    return;
  }
  if (name === "diamondTension") {
    playNoise(ctx, now, 0.5, 0.004, 4200);
    playTone(ctx, now + 0.12, 659, 0.42, 0.004, "sine");
    return;
  }
  if (name === "masterTension") {
    playTone(ctx, now, 220, 0.72, 0.006, "sine");
    playTone(ctx, now + 0.12, 330, 0.62, 0.004, "sine");
    playNoise(ctx, now + 0.08, 0.52, 0.003, 4800);
    return;
  }
  if (name === "flip") {
    playNoise(ctx, now, 0.14, 0.008, 3400);
    playNoise(ctx, now + 0.18, 0.06, 0.006, 5200);
    return;
  }
  if (name === "reveal") {
    playTone(ctx, now, 880, 0.34, 0.007, "sine");
    playTone(ctx, now + 0.04, 1320, 0.42, 0.005, "sine");
    playTone(ctx, now + 0.1, 1760, 0.5, 0.0035, "triangle");
    playNoise(ctx, now + 0.04, 0.22, 0.004, 5200);
  }
}

function playAuctionAssetSound(name: AuctionSoundName) {
  if (typeof window === "undefined") return false;
  const src = AUCTION_SOUND_PATHS[name];
  if (!src) return false;

  try {
    const soundWindow = window as AuctionSoundWindow;
    const cached = soundWindow.__klolAuctionAssetCache?.[name];
    const audio = cached ? (cached.cloneNode(true) as HTMLAudioElement) : new Audio(src);
    audio.volume = AUCTION_SOUND_VOLUME[name];
    audio.currentTime = 0;
    void audio.play().catch(() => playGeneratedAuctionSound(name, true));
    return true;
  } catch {
    return false;
  }
}

function playAuctionSound(name: AuctionSoundName, enabled = true) {
  if (!enabled) return;
  const playedAsset = playAuctionAssetSound(name);
  if (!playedAsset) playGeneratedAuctionSound(name, true);
}

function getMemberForPosition(team: Team, position: Position) {
  return team.members.find((member) => member.position === position) ?? null;
}

function getTeamPositionStatus(team: Team, position: Position) {
  const member = getMemberForPosition(team, position);

  if (!member) {
    return {
      label: "비어있음",
      filled: false,
    };
  }

  return {
    label: `${member.player.name || member.player.nickname}${member.isCaptain ? " · 팀장" : ""}`,
    subLabel: "",
    filled: true,
    isCaptain: member.isCaptain,
  };
}

function getPositionLabel(position: Position) {
  return position;
}

function getDisplayName(participant: Participant | null) {
  if (!participant) return "미정";
  return participant.player.name || participant.player.nickname;
}

function getDisplayNickname(participant: Participant | null) {
  if (!participant) return "-";
  return `${participant.player.nickname}#${participant.player.tag}`;
}

function getPositionTheme(position?: Position | null) {
  switch (position) {
    case "TOP":
      return {
        glow: "rgba(248,113,113,0.45)",
        border: "rgba(248,113,113,0.88)",
        badge:
          "linear-gradient(135deg, rgba(239,68,68,0.95), rgba(249,115,22,0.88))",
      };
    case "JGL":
      return {
        glow: "rgba(52,211,153,0.45)",
        border: "rgba(52,211,153,0.88)",
        badge:
          "linear-gradient(135deg, rgba(16,185,129,0.95), rgba(34,197,94,0.88))",
      };
    case "MID":
      return {
        glow: "rgba(167,139,250,0.45)",
        border: "rgba(167,139,250,0.88)",
        badge:
          "linear-gradient(135deg, rgba(139,92,246,0.95), rgba(99,102,241,0.88))",
      };
    case "ADC":
      return {
        glow: "rgba(250,204,21,0.45)",
        border: "rgba(250,204,21,0.88)",
        badge:
          "linear-gradient(135deg, rgba(250,204,21,0.95), rgba(245,158,11,0.88))",
      };
    case "SUP":
      return {
        glow: "rgba(56,189,248,0.45)",
        border: "rgba(56,189,248,0.88)",
        badge:
          "linear-gradient(135deg, rgba(14,165,233,0.95), rgba(59,130,246,0.88))",
      };
    default:
      return {
        glow: "rgba(96,165,250,0.42)",
        border: "rgba(96,165,250,0.8)",
        badge:
          "linear-gradient(135deg, rgba(59,130,246,0.95), rgba(37,99,235,0.88))",
      };
  }
}

function getTierVisual(tierText?: string | null): TierVisual {
  const value = String(tierText ?? "").toLowerCase();
  if (!value) {
    return {
      key: "UNRANKED",
      primary: "#3b82f6",
      secondary: "#0f172a",
      glow: "rgba(59,130,246,0.42)",
      border: "rgba(96,165,250,0.85)",
      textGlow: "rgba(59,130,246,0.34)",
      accent: "rgba(255,255,255,0.14)",
      highTier: false,
    };
  }
  if (value.includes("챌린저"))
    return {
      key: "CHALLENGER",
      primary: "#f8fafc",
      secondary: "#60a5fa",
      glow: "rgba(125,211,252,0.58)",
      border: "rgba(224,242,254,0.95)",
      textGlow: "rgba(147,197,253,0.55)",
      accent: "rgba(255,255,255,0.26)",
      highTier: true,
    };
  if (value.includes("그랜드마스터"))
    return {
      key: "GRANDMASTER",
      primary: "#ef4444",
      secondary: "#7f1d1d",
      glow: "rgba(239,68,68,0.56)",
      border: "rgba(252,165,165,0.95)",
      textGlow: "rgba(248,113,113,0.48)",
      accent: "rgba(255,255,255,0.18)",
      highTier: true,
    };
  if (value.includes("마스터"))
    return {
      key: "MASTER",
      primary: "#c084fc",
      secondary: "#581c87",
      glow: "rgba(192,132,252,0.52)",
      border: "rgba(221,214,254,0.95)",
      textGlow: "rgba(196,181,253,0.48)",
      accent: "rgba(255,255,255,0.16)",
      highTier: true,
    };
  if (value.includes("다이아"))
    return {
      key: "DIAMOND",
      primary: "#38bdf8",
      secondary: "#1d4ed8",
      glow: "rgba(56,189,248,0.54)",
      border: "rgba(125,211,252,0.95)",
      textGlow: "rgba(125,211,252,0.42)",
      accent: "rgba(255,255,255,0.16)",
      highTier: true,
    };
  if (value.includes("에메랄드"))
    return {
      key: "EMERALD",
      primary: "#10b981",
      secondary: "#065f46",
      glow: "rgba(16,185,129,0.42)",
      border: "rgba(110,231,183,0.88)",
      textGlow: "rgba(110,231,183,0.32)",
      accent: "rgba(255,255,255,0.12)",
      highTier: false,
    };
  if (value.includes("플래티넘"))
    return {
      key: "PLATINUM",
      primary: "#2dd4bf",
      secondary: "#155e75",
      glow: "rgba(45,212,191,0.42)",
      border: "rgba(153,246,228,0.88)",
      textGlow: "rgba(94,234,212,0.3)",
      accent: "rgba(255,255,255,0.12)",
      highTier: false,
    };
  if (value.includes("골드"))
    return {
      key: "GOLD",
      primary: "#fbbf24",
      secondary: "#92400e",
      glow: "rgba(251,191,36,0.42)",
      border: "rgba(253,224,71,0.88)",
      textGlow: "rgba(252,211,77,0.32)",
      accent: "rgba(255,255,255,0.12)",
      highTier: false,
    };
  if (value.includes("실버"))
    return {
      key: "SILVER",
      primary: "#cbd5e1",
      secondary: "#475569",
      glow: "rgba(203,213,225,0.38)",
      border: "rgba(226,232,240,0.8)",
      textGlow: "rgba(226,232,240,0.28)",
      accent: "rgba(255,255,255,0.12)",
      highTier: false,
    };
  if (value.includes("브론즈"))
    return {
      key: "BRONZE",
      primary: "#b45309",
      secondary: "#451a03",
      glow: "rgba(180,83,9,0.38)",
      border: "rgba(251,191,36,0.62)",
      textGlow: "rgba(245,158,11,0.26)",
      accent: "rgba(255,255,255,0.1)",
      highTier: false,
    };
  if (value.includes("아이언"))
    return {
      key: "IRON",
      primary: "#6b7280",
      secondary: "#111827",
      glow: "rgba(107,114,128,0.34)",
      border: "rgba(156,163,175,0.68)",
      textGlow: "rgba(209,213,219,0.22)",
      accent: "rgba(255,255,255,0.08)",
      highTier: false,
    };
  return {
    key: "UNRANKED",
    primary: "#3b82f6",
    secondary: "#0f172a",
    glow: "rgba(59,130,246,0.42)",
    border: "rgba(96,165,250,0.85)",
    textGlow: "rgba(59,130,246,0.34)",
    accent: "rgba(255,255,255,0.14)",
    highTier: false,
  };
}

function getTierImagePath(tierText?: string | null) {
  const key = getTierVisual(tierText).key.toLowerCase();
  switch (key) {
    case "challenger":
      return "/images/tiers/challenger.webp";
    case "grandmaster":
      return "/images/tiers/grandmaster.webp";
    case "master":
      return "/images/tiers/master.webp";
    case "diamond":
      return "/images/tiers/diamond.webp";
    case "emerald":
      return "/images/tiers/emerald.webp";
    case "platinum":
      return "/images/tiers/platinum.webp";
    case "gold":
      return "/images/tiers/gold.webp";
    case "silver":
      return "/images/tiers/silver.webp";
    case "bronze":
      return "/images/tiers/bronze.webp";
    case "iron":
      return "/images/tiers/iron.webp";
    default:
      return "/images/tiers/silver.webp";
  }
}

function getTierRankFromKey(key: string) {
  switch (key.toUpperCase()) {
    case "IRON":
      return 1;
    case "BRONZE":
      return 2;
    case "SILVER":
      return 3;
    case "GOLD":
      return 4;
    case "PLATINUM":
      return 5;
    case "EMERALD":
      return 6;
    case "DIAMOND":
      return 7;
    case "MASTER":
      return 8;
    case "GRANDMASTER":
      return 9;
    case "CHALLENGER":
      return 10;
    default:
      return 3;
  }
}

function getTierCriteriaClass(rank: number) {
  if (rank >= 8) return "master-plus";
  if (rank >= 5) return "ascent-tier";
  return "gold-below";
}

function getTierAscentSteps(maxRank: number, minRank = 3) {
  const steps = [
    { rank: 3 },
    { rank: 4 },
    { rank: 5 },
    { rank: 6 },
    { rank: 7 },
    { rank: 8 },
    { rank: 9 },
    { rank: 10 },
  ];

  return steps.filter((step) => step.rank >= minRank && step.rank <= maxRank);
}

async function animateTierAscentSequence(
  maxRank: number,
  onStep?: (rank: number) => void,
  minRank = 3,
) {
  const steps = getTierAscentSteps(maxRank, minRank);

  for (let index = 0; index < steps.length; index += 1) {
    const rank = steps[index].rank;
    onStep?.(rank);
    const progressiveDelay =
      190 + index * 38 + (rank >= 7 ? 90 : 0) + (rank >= 8 ? 130 : 0);
    await wait(progressiveDelay);
  }
}

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="auction-front-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function DestructionAuctionManager({
  tournamentId,
  teams,
  participants,
  hasMatches,
  liveMode = false,
}: Props) {
  const router = useRouter();
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [purchasePoint, setPurchasePoint] = useState("1");
  const [error, setError] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [drawnPreview, setDrawnPreview] = useState<Participant | null>(null);
  const [drawPhase, setDrawPhase] = useState<DrawPhase>("IDLE");
  const [ascentRank, setAscentRank] = useState(0);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isPreviewFullscreenOpen, setIsPreviewFullscreenOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const lastShuffleTickRef = useRef(0);
  const deckCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pickedShellRef = useRef<HTMLDivElement | null>(null);
  const showcaseStageRef = useRef<HTMLDivElement | null>(null);
  const flipBridgeRef = useRef<HTMLDivElement | null>(null);
  const [flipBridge, setFlipBridge] = useState<FlipDrawBridgeState | null>(null);

  const activeDrawn = useMemo(
    () =>
      participants.find(
        (participant) =>
          !participant.isCaptain && participant.auctionStatus === "DRAWN",
      ),
    [participants],
  );
  const selectedParticipant = useMemo(() => {
    const id = Number(
      selectedParticipantId || activeDrawn?.id || drawnPreview?.id || 0,
    );
    return (
      participants.find((participant) => participant.id === id) ??
      drawnPreview ??
      null
    );
  }, [participants, selectedParticipantId, activeDrawn, drawnPreview]);

  const pendingCount = participants.filter(
    (participant) =>
      !participant.isCaptain && participant.auctionStatus === "PENDING",
  ).length;
  const holdCount = participants.filter(
    (participant) =>
      !participant.isCaptain && participant.auctionStatus === "HOLD",
  ).length;
  const drawnCount = participants.filter(
    (participant) =>
      !participant.isCaptain && participant.auctionStatus === "DRAWN",
  ).length;
  const soldCount = participants.filter(
    (participant) =>
      !participant.isCaptain && participant.auctionStatus === "SOLD",
  ).length;
  const totalAuctionTargets = participants.filter(
    (participant) => !participant.isCaptain,
  ).length;
  const auctionTargetPoolLabel =
    pendingCount > 0
      ? "일반 미추첨"
      : holdCount > 0
        ? "보류자 재추첨"
        : "추첨 완료";
  const auctionMiniStageState =
    pendingCount > 0 || holdCount > 0 ? "ready" : "complete";
  const auctionMiniStageLabel =
    pendingCount > 0
      ? `${pendingCount}명 대기`
      : holdCount > 0
        ? `${holdCount}명 보류`
        : "경매 추첨 완료";
  const renderMiniCardStack = () => (
    <div
      className={`mini-card-stack mini-card-stack--${auctionMiniStageState}`}
      aria-hidden="true"
    >
      <Image
        className="mini-card-stack-card mini-card-stack-card--back-left"
        src="/auction-cards/back-premium.svg"
        alt=""
        width={72}
        height={104}
      />
      <Image
        className="mini-card-stack-card mini-card-stack-card--back-right"
        src="/auction-cards/back-premium.svg"
        alt=""
        width={72}
        height={104}
      />
      <Image
        className="mini-card-stack-card mini-card-stack-card--front"
        src="/auction-cards/back-premium.svg"
        alt=""
        width={72}
        height={104}
      />
      <div className="mini-card-status">{auctionMiniStageLabel}</div>
    </div>
  );

  const selectedTeam = teams.find((team) => team.id === Number(selectedTeamId));
  const currentTarget = activeDrawn ?? selectedParticipant;
  const currentTheme = getPositionTheme(currentTarget?.position);
  const tierReference =
    currentTarget?.player.currentTier ?? currentTarget?.player.peakTier ?? null;
  const tierVisual = getTierVisual(tierReference);
  const tierRank = getTierRankFromKey(tierVisual.key);
  const tierCriteriaClassName = getTierCriteriaClass(tierRank);
  const tierImagePath = getTierImagePath(tierReference);
  const selectedTeamHasSamePosition = Boolean(
    selectedTeam &&
    currentTarget &&
    getMemberForPosition(selectedTeam, currentTarget.position),
  );
  const selectedTeamIsFull = Boolean(
    selectedTeam && selectedTeam.members.length >= 5,
  );

  useEffect(() => {
    if (!isOverlayOpen && !isPreviewFullscreenOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOverlayOpen, isPreviewFullscreenOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("klolAuctionSoundEnabled");
    if (saved === "0") {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
    }
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        "klolAuctionSoundEnabled",
        soundEnabled ? "1" : "0",
      );
  }, [soundEnabled]);

  useEffect(() => {
    // 추첨 중 반복 저음/드럼처럼 들리는 현상을 막기 위해
    // 카드 펼침 효과음은 handleDraw 시작 시 1회만 재생합니다.
  }, [drawPhase, isOverlayOpen, soundEnabled]);

  const baseVisual = SHUFFLE_NEUTRAL_TIER_VISUAL;

  const shouldRevealTierTheme =
    drawPhase === "TIER_ASCENDING" ||
    drawPhase === "SPECIAL_TENSION" ||
    drawPhase === "FLIPPING" ||
    drawPhase === "REVEALED";

  const overlayTierClassName = shouldRevealTierTheme
    ? `tier-${tierVisual.key.toLowerCase()} ${tierCriteriaClassName}`
    : "";

  const ascentClassName = ascentRank > 0 ? `ascent-${ascentRank}` : "";
  const overlayAscentClass =
    drawPhase === "TIER_ASCENDING" ? ascentClassName : "";

  const overlayHighTierClass =
    shouldRevealTierTheme && tierRank >= 8 ? "high-tier" : "";
  const overlayBridgeClass = flipBridge ? "bridge-active" : "";
  const effectiveCardVisual = shouldRevealTierTheme ? tierVisual : baseVisual;

  const visualVars = {
    "--tier-primary": baseVisual.primary,
    "--tier-secondary": baseVisual.secondary,
    "--tier-glow": baseVisual.glow,
    "--tier-border": baseVisual.border,
    "--tier-text-glow": baseVisual.textGlow,
    "--tier-accent": baseVisual.accent,
    "--card-tier-primary": effectiveCardVisual.primary,
    "--card-tier-secondary": effectiveCardVisual.secondary,
    "--card-tier-glow": effectiveCardVisual.glow,
    "--card-tier-border": effectiveCardVisual.border,
    "--card-tier-text-glow": effectiveCardVisual.textGlow,
    "--card-tier-accent": effectiveCardVisual.accent,
    "--position-glow": currentTheme.glow,
    "--position-border": currentTheme.border,
  } as CSSProperties;

  const isShuffleAnimationPhase = drawPhase === "SHUFFLING";
  const getDrawCardIndexForParticipant = (participant: Participant | null) =>
    participant ? ((participant.id * 7) % 5) + 1 : 3;

  const getDrawCardRotation = (cardIndex: number) => {
    const rotations = [-10, -5, 0, 5, 10];
    return rotations[Math.max(0, Math.min(4, cardIndex - 1))] ?? 0;
  };

  const drawCardClassName = `draw-card-${getDrawCardIndexForParticipant(currentTarget)}`;
  const drawPhaseCopy = {
    IDLE: {
      title: "플레이어 대기 중",
      description: "추첨을 시작하면 다음 경매 대상이 선택됩니다.",
    },
    SHUFFLING: {
      title: "플레이어 추첨 중...",
      description: "경매 후보를 섞고 있습니다.",
    },
    SELECTING: {
      title: "플레이어 선택",
      description: "이번 경매 대상이 선택되었습니다.",
    },
    APPROACHING: {
      title: "플레이어 확인 중...",
      description: "선택된 플레이어 정보를 불러옵니다.",
    },
    TIER_ASCENDING: {
      title: "티어 확인 중...",
      description: "플레이어의 티어 정보가 반영됩니다.",
    },
    SPECIAL_TENSION: {
      title: "상위 티어 반응",
      description: "높은 티어의 플레이어가 감지되었습니다.",
    },
    FLIPPING: {
      title: "플레이어 공개 중...",
      description: "경매 대상 정보를 공개합니다.",
    },
    REVEALED: {
      title: "플레이어 공개 완료",
      description: "낙찰 팀과 포인트를 입력하세요.",
    },
  } satisfies Record<DrawPhase, { title: string; description: string }>;
  const drawPhaseTitle = drawPhaseCopy[drawPhase].title;
  const drawPhaseDescription = drawPhaseCopy[drawPhase].description;

  const openOverlayForCurrent = () => {
    if (!currentTarget) return;
    setIsOverlayOpen(true);
    setDrawPhase("REVEALED");
  };

  const openPreviewFullscreen = () => {
    setIsPreviewFullscreenOpen(true);
  };

  const closePreviewFullscreen = () => {
    setIsPreviewFullscreenOpen(false);
  };

  const openLiveAuctionScreen = () => {
    if (typeof window === "undefined") return;
    window.open(
      `/destruction-auction-live/${tournamentId}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const closeOverlay = () => {
    if (isDrawing || isResolving) return;
    setIsOverlayOpen(false);
    if (!currentTarget) setDrawPhase("IDLE");
    setFlipBridge(null);
  };

  const waitForNextPaint = () =>
    new Promise<void>((resolve) => {
      if (typeof window === "undefined") {
        resolve();
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

  const runFlipDrawAnimation = async (
    participant: Participant,
    resultTierRank: number,
  ) => {
    const cardIndex = getDrawCardIndexForParticipant(participant);
    setDrawPhase("SELECTING");
    playAuctionSound("select", soundEnabledRef.current);

    await waitForNextPaint();
    // 선택된 카드가 실제 펼쳐진 덱 안에서 한 박자 인지된 뒤 빠져나오도록
    // SELECTING 진입 직후 바로 브릿지 카드를 띄우지 않습니다.
    await wait(360);

    const source = deckCardRefs.current[cardIndex - 1];
    const pickedShell = pickedShellRef.current;
    const stage = showcaseStageRef.current;
    const target =
      pickedShell?.querySelector<HTMLElement>(".gacha-picked-card") ??
      pickedShell;

    if (
      typeof window === "undefined" ||
      !source ||
      !target ||
      !stage ||
      !source.getBoundingClientRect ||
      !target.getBoundingClientRect ||
      !stage.getBoundingClientRect
    ) {
      await wait(resultTierRank >= 8 ? 1240 : resultTierRank >= 5 ? 1180 : 1120);
      return false;
    }

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    if (
      sourceRect.width <= 0 ||
      sourceRect.height <= 0 ||
      targetRect.width <= 0 ||
      targetRect.height <= 0 ||
      stageRect.width <= 0 ||
      stageRect.height <= 0
    ) {
      await wait(resultTierRank >= 8 ? 1240 : resultTierRank >= 5 ? 1180 : 1120);
      return false;
    }

    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    const dx = targetCenterX - sourceCenterX;
    const dy = targetCenterY - sourceCenterY;
    const rotation = getDrawCardRotation(cardIndex);
    const sourceWidth = Math.max(1, source.offsetWidth || sourceRect.width);
    const sourceHeight = Math.max(1, source.offsetHeight || sourceRect.height);
    const sourceLocalLeft = sourceCenterX - stageRect.left - sourceWidth / 2;
    const sourceLocalTop = sourceCenterY - stageRect.top - sourceHeight / 2;
    const rotationRad = Math.abs(rotation) * (Math.PI / 180);
    const rotatedWidthAtScaleOne =
      sourceWidth * Math.cos(rotationRad) + sourceHeight * Math.sin(rotationRad);
    const rotatedHeightAtScaleOne =
      sourceWidth * Math.sin(rotationRad) + sourceHeight * Math.cos(rotationRad);
    const measuredScaleX = sourceRect.width / Math.max(1, rotatedWidthAtScaleOne);
    const measuredScaleY = sourceRect.height / Math.max(1, rotatedHeightAtScaleOne);
    const startScale = Math.max(0.66, Math.min(1.08, Math.min(measuredScaleX, measuredScaleY) || 0.94));

    setFlipBridge({
      left: sourceLocalLeft,
      top: sourceLocalTop,
      width: sourceWidth,
      height: sourceHeight,
      cardIndex,
      rotation,
      startScale,
    });

    await waitForNextPaint();

    const bridge = flipBridgeRef.current;
    if (!bridge || !bridge.animate) {
      setFlipBridge(null);
      await wait(resultTierRank >= 8 ? 1240 : resultTierRank >= 5 ? 1180 : 1120);
      return false;
    }

    const duration = resultTierRank >= 8 ? 1420 : resultTierRank >= 5 ? 1340 : 1280;
    const lift = Math.max(64, Math.min(104, Math.abs(dy) * 0.18 + 54));
    const targetScaleX = targetRect.width / sourceWidth;
    const targetScaleY = targetRect.height / sourceHeight;
    const finalScale = Math.max(
      1.18,
      Math.min(4.8, Math.min(targetScaleX, targetScaleY)),
    );
    const scaleAt14 = startScale + (finalScale - startScale) * 0.04;
    const scaleAt36 = startScale + (finalScale - startScale) * 0.18;
    const scaleAt68 = startScale + (finalScale - startScale) * 0.56;
    const scaleAt92 = startScale + (finalScale - startScale) * 0.91;

    const animation = bridge.animate(
      [
        {
          offset: 0,
          opacity: 1,
          transform: `translate3d(0px, 0px, 0) rotate(${rotation}deg) scale(${startScale})`,
        },
        {
          offset: 0.14,
          opacity: 1,
          transform: `translate3d(${dx * 0.018}px, ${dy * 0.018 - 16}px, 0) rotate(${rotation * 0.94}deg) scale(${scaleAt14})`,
        },
        {
          offset: 0.36,
          opacity: 1,
          transform: `translate3d(${dx * 0.18}px, ${dy * 0.16 - lift}px, 0) rotate(${rotation * 0.68}deg) scale(${scaleAt36})`,
        },
        {
          offset: 0.68,
          opacity: 1,
          transform: `translate3d(${dx * 0.62}px, ${dy * 0.66 - lift * 0.28}px, 0) rotate(${rotation * 0.22}deg) scale(${scaleAt68})`,
        },
        {
          offset: 0.92,
          opacity: 1,
          transform: `translate3d(${dx * 0.94}px, ${dy * 0.96 - lift * 0.04}px, 0) rotate(${rotation * 0.04}deg) scale(${scaleAt92})`,
        },
        {
          offset: 1,
          opacity: 1,
          transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(${finalScale})`,
        },
      ],
      {
        duration: duration + 80,
        easing: "cubic-bezier(.14,.78,.16,1)",
        fill: "forwards",
      },
    );

    try {
      await animation.finished;
      return true;
    } catch {
      // Animation can be cancelled by closing overlay or route refresh.
      setFlipBridge(null);
      return false;
    }
  };
  const handleDraw = async () => {
    setError("");
    setIsDrawing(true);
    setDrawnPreview(null);
    setSelectedParticipantId("");
    setSelectedTeamId("");
    setPurchasePoint("1");
    setAscentRank(0);
    setFlipBridge(null);
    setIsOverlayOpen(true);
    setDrawPhase("SHUFFLING");
    lastShuffleTickRef.current = Date.now();
    void unlockAuctionAudio();
    playAuctionSound("shuffleTick", soundEnabledRef.current);

    try {
      const startedAt = Date.now();
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/auction/draw`,
        { method: "POST" },
      );
      const data = await res.json();
      const elapsed = Date.now() - startedAt;

      if (!res.ok) {
        setError(data.message ?? "추첨 실패");
        setDrawPhase("IDLE");
        setIsOverlayOpen(false);
        return;
      }

      const participant = data.participant as Participant;
      setDrawnPreview(participant);
      setSelectedParticipantId(String(participant.id));
      setSelectedTeamId("");
      setPurchasePoint("1");

      const tierForResult = getTierVisual(
        participant.player.currentTier ?? participant.player.peakTier ?? null,
      );
      const resultTierRank = getTierRankFromKey(tierForResult.key);
      const baseShuffleMs =
        resultTierRank >= 8 ? 1750 : resultTierRank >= 5 ? 1600 : 1450;
      if (elapsed < baseShuffleMs) await wait(baseShuffleMs - elapsed);

      const flipDrawCompleted = await runFlipDrawAnimation(participant, resultTierRank);
      playAuctionSound("confirm", soundEnabledRef.current);

      setDrawPhase("TIER_ASCENDING");
      if (flipDrawCompleted) {
        await waitForNextPaint();
        setFlipBridge(null);
      }
      if (resultTierRank <= 4) {
        setAscentRank(resultTierRank);
        playAuctionSound("tierStep", soundEnabledRef.current);
        await wait(resultTierRank === 4 ? 560 : 460);
      } else {
        await animateTierAscentSequence(resultTierRank, (rank) => {
          setAscentRank(rank);
          playAuctionSound("tierStep", soundEnabledRef.current);
        });
        if (resultTierRank >= 7) {
          playAuctionSound("diamondTension", soundEnabledRef.current);
        }
        await wait(
          resultTierRank >= 8 ? 560 : resultTierRank === 7 ? 520 : 360,
        );
      }

      if (resultTierRank >= 8) {
        setDrawPhase("SPECIAL_TENSION");
        playAuctionSound("masterTension", soundEnabledRef.current);
        await wait(resultTierRank >= 9 ? 900 : 780);
      }

      setDrawPhase("FLIPPING");
      playAuctionSound("flip", soundEnabledRef.current);
      await wait(resultTierRank >= 8 ? 1180 : resultTierRank >= 5 ? 980 : 820);

      setDrawPhase("REVEALED");
      playAuctionSound("reveal", soundEnabledRef.current);
      await wait(1500);
    } catch {
      setError("추첨 중 오류가 발생했습니다.");
      setDrawPhase("IDLE");
      setIsOverlayOpen(false);
    } finally {
      setIsDrawing(false);
    }
  };

  const handleResolve = async (action: "SOLD" | "HOLD") => {
    setError("");
    const targetParticipantId = Number(
      selectedParticipantId || activeDrawn?.id || drawnPreview?.id,
    );
    if (!targetParticipantId) {
      setError("처리할 추첨 참가자가 없습니다.");
      return;
    }
    if (action === "SOLD") {
      if (!selectedTeamId) return void setError("낙찰 팀을 선택해주세요.");
      if (!Number.isInteger(Number(purchasePoint)) || Number(purchasePoint) < 1)
        return void setError("낙찰 포인트는 최소 1포인트 이상이어야 합니다.");
      if (selectedTeamHasSamePosition)
        return void setError(
          `선택한 팀에는 이미 ${currentTarget?.position} 포지션이 있습니다.`,
        );
      if (selectedTeamIsFull)
        return void setError("선택한 팀은 이미 5명입니다.");
    }

    setIsResolving(true);
    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/auction/resolve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId: targetParticipantId,
            action,
            teamId: selectedTeamId ? Number(selectedTeamId) : undefined,
            purchasePoint: purchasePoint ? Number(purchasePoint) : undefined,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) return void setError(data.message ?? "경매 결과 처리 실패");
      setSelectedParticipantId("");
      setSelectedTeamId("");
      setPurchasePoint("1");
      setDrawnPreview(null);
      setAscentRank(0);
      setDrawPhase("IDLE");
      setIsOverlayOpen(false);
      router.refresh();
    } catch {
      setError("경매 결과 처리 중 오류가 발생했습니다.");
    } finally {
      setIsResolving(false);
    }
  };

  const drawableDisabled =
    hasMatches || isDrawing || Boolean(activeDrawn) || teams.length === 0;

  const renderAuctionFields = (compact = false) => (
    <div
      className={compact ? "auction-front-form compact" : "auction-front-form"}
    >
      <label className="admin-form__field">
        <span className="admin-form__label">선택된 팀</span>
        <select
          className="admin-form__input"
          value={selectedTeamId}
          onChange={(event) => setSelectedTeamId(event.target.value)}
          disabled={hasMatches || isResolving}
        >
          <option value="">팀 선택</option>
          {teams.map((team) => {
            const blockedByPosition = currentTarget
              ? Boolean(getMemberForPosition(team, currentTarget.position))
              : false;
            const blockedByFull = team.members.length >= 5;
            return (
              <option
                key={team.id}
                value={team.id}
                disabled={blockedByPosition || blockedByFull}
              >
                {team.name} · 남은 {team.remainingAuctionPoints}P
                {blockedByPosition ? ` · ${currentTarget?.position} 보유` : ""}
                {blockedByFull ? " · 정원" : ""}
              </option>
            );
          })}
        </select>
      </label>
      <label className="admin-form__field">
        <span className="admin-form__label">포인트 입력</span>
        <input
          className="admin-form__input"
          type="number"
          min="1"
          value={purchasePoint}
          onChange={(event) => setPurchasePoint(event.target.value)}
          disabled={hasMatches || isResolving}
        />
      </label>
      <div className="admin-form__actions auction-front-actions">
        <button
          type="button"
          className="admin-page__create-button"
          onClick={() => handleResolve("SOLD")}
          disabled={hasMatches || isResolving || !currentTarget}
        >
          {isResolving ? "처리 중..." : "낙찰 저장"}
        </button>
        <button
          type="button"
          className="chip-button"
          onClick={() => handleResolve("HOLD")}
          disabled={hasMatches || isResolving || !currentTarget}
        >
          낙찰 보류
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={
        liveMode
          ? "destruction-auction-manager destruction-admin-panel-wide is-live-mode"
          : "destruction-auction-manager destruction-admin-panel-wide"
      }
      style={visualVars}
    >
      <style>{`
        .destruction-admin-panel-wide { width: 100%; }
        .destruction-auction-summary { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; margin-bottom: 18px; }
        .destruction-auction-layout { display: grid; grid-template-columns: minmax(520px, 1.45fr) minmax(360px, 0.98fr); gap: 18px; align-items: stretch; }
        .destruction-auction-right { display: grid; gap: 14px; align-content: start; }
        .destruction-team-matrix { overflow-x: auto; overflow-y: hidden; border: 1px solid rgba(59,130,246,0.32); border-radius: 18px; background: rgba(7,16,35,0.72); max-width: 100%; }
        .destruction-team-matrix-grid { width: 100%; min-width: 680px; display: grid; grid-template-columns: minmax(132px, 0.95fr) repeat(5, minmax(104px, 1fr)); }
        .matrix-cell { min-height: 68px; padding: 10px; border-right: 1px solid rgba(59,130,246,0.18); border-bottom: 1px solid rgba(59,130,246,0.18); display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; }
        .matrix-header { min-height: 54px; background: rgba(15,36,72,0.86); font-weight: 900; color: #eaf4ff; }
        .matrix-position { background: rgba(12,25,50,0.94); color: #60a5fa; font-size: 14px; font-weight: 900; letter-spacing: 0.04em; align-items: center; text-align: center; }
        .matrix-team-header { align-items: flex-start; text-align: left; color: #cfe7ff; }
        .matrix-team-name { background: rgba(12,25,50,0.72); color: #eaf4ff; gap: 8px; align-items: flex-start; }
        .matrix-team-name strong { font-size: 15px; line-height: 1.15; }
        .matrix-team-point { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; border: 1px solid rgba(96,165,250,0.22); background: rgba(37,99,235,0.10); color: #b9d7ff; font-size: 12px; font-weight: 800; padding: 4px 8px; }
        .matrix-empty { color: rgba(199,213,235,0.52); border: 1px dashed rgba(148,163,184,0.20); border-radius: 12px; padding: 10px; text-align: center; width: 100%; }
        .matrix-filled { border-radius: 12px; border: 1px solid rgba(34,197,94,0.26); background: rgba(34,197,94,0.08); padding: 9px; width: 100%; min-height: 48px; display: grid; align-content: center; }
        .matrix-filled.is-captain { border-color: rgba(250,204,21,0.45); background: rgba(250,204,21,0.10); }
        .auction-message-box { border: 1px solid rgba(96,165,250,.28); border-radius: 14px; background: rgba(15,23,42,.54); padding: 12px; margin-top: 12px; color: #dbeafe; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
        .auction-message-box strong { display: block; color: #f8fbff; margin-bottom: 4px; }
        .auction-message-box span { color: #93a4bd; }
        .matrix-player-name { font-weight: 900; color: #f8fbff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .matrix-player-sub { color: #a8bedb; font-size: 11px; word-break: break-all; line-height: 1.25; }
        .auction-control-panel { border: 1px solid rgba(59,130,246,0.32); border-radius: 18px; background: rgba(7,16,35,0.72); padding: 18px; }
        .auction-mini-stage { position: relative; min-height: 304px; border-radius: 22px; border: 1px solid color-mix(in srgb, var(--tier-border) 70%, rgba(96,165,250,0.3)); overflow: hidden; background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--tier-primary) 38%, rgba(37,99,235,0.28)), rgba(2,8,23,0.42) 55%, rgba(0,0,0,0.22)); }
        .auction-mini-stage::before { content: ""; position: absolute; inset: -30% -10%; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--tier-accent) 80%, rgba(255,255,255,0.1)), transparent); animation: auctionMiniSweep 4s linear infinite; }
        .auction-mini-center { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; min-height: 304px; padding: 24px; }
        .mini-card-stack { position: relative; width: 230px; height: 292px; perspective: 1200px; display: grid; place-items: center; }
        .mini-card-stack-card { position: absolute; width: 168px; height: 238px; object-fit: contain; filter: drop-shadow(0 28px 34px rgba(0,0,0,0.56)) drop-shadow(0 0 28px color-mix(in srgb, var(--tier-glow) 44%, transparent)); transform-origin: 50% 82%; transition: transform 220ms ease, opacity 220ms ease; }
        .mini-card-stack-card--back-left { transform: translate(-42px, 19px) rotate(-13deg) scale(.94); opacity: .72; }
        .mini-card-stack-card--back-right { transform: translate(42px, 18px) rotate(13deg) scale(.94); opacity: .72; }
        .mini-card-stack-card--front { transform: translateY(-3px) rotate(-1deg); opacity: .98; }
        .mini-card-stack--complete .mini-card-stack-card { filter: grayscale(.35) drop-shadow(0 22px 28px rgba(0,0,0,.48)); opacity: .48; }
        .mini-card-status { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); min-width: 132px; text-align: center; border-radius: 999px; border: 1px solid rgba(125,211,252,.36); background: rgba(4,12,28,.78); color: #d9f3ff; font-size: 12px; font-weight: 900; letter-spacing: .08em; padding: 8px 12px; box-shadow: 0 14px 34px rgba(0,0,0,.34), 0 0 22px rgba(56,189,248,.16); }
        .auction-current-preview { width: min(100%, 360px); border-radius: 24px; border: 1px solid var(--tier-border); background: linear-gradient(160deg, color-mix(in srgb, var(--tier-secondary) 38%, rgba(14,24,48,0.95)), rgba(19,35,62,0.96)); padding: 20px; box-shadow: 0 16px 40px rgba(0,0,0,0.32), 0 0 30px color-mix(in srgb, var(--tier-glow) 32%, transparent); }
        .auction-front-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .auction-position-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 72px; padding: 8px 12px; border-radius: 999px; color: #fff; font-weight: 900; font-size: 13px; letter-spacing: 0.06em; box-shadow: 0 10px 22px rgba(0,0,0,0.24); }
        .auction-front-name { font-size: 28px; font-weight: 900; color: #f8fbff; line-height: 1.1; text-shadow: 0 0 14px var(--tier-text-glow); }
        .auction-front-sub { color: #bfd3ef; font-size: 14px; margin-top: 4px; word-break: break-all; }
        .auction-front-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
        .auction-front-stat { border-radius: 18px; border: 1px solid color-mix(in srgb, var(--tier-border) 34%, rgba(255,255,255,0.08)); background: linear-gradient(180deg, color-mix(in srgb, var(--tier-primary) 14%, rgba(9,17,33,0.45)), rgba(9,17,33,0.70)); padding: 16px; display: grid; gap: 8px; min-height: 104px; align-content: start; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
        .auction-front-stat span { font-size: 12px; color: #9fb8d8; letter-spacing: 0.04em; font-weight: 700; }
        .auction-front-stat strong { font-size: 20px; color: #f8fbff; line-height: 1.2; word-break: keep-all; }
        .gacha-card-face.front .auction-front-stat { min-height: 92px; padding: 16px 18px; grid-template-columns: 94px 1fr; align-items: center; border-color: rgba(125,211,252,0.28); background-color: #0b1d31; background-image: linear-gradient(135deg, rgba(37,99,235,0.16), rgba(6,16,31,0.98)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 14px 28px rgba(0,0,0,0.26); }
        .gacha-card-face.front .auction-front-stat strong { text-shadow: 0 0 12px var(--card-tier-text-glow); font-size: 26px; }
        .auction-front-form { display: grid; gap: 12px; margin-top: 18px; }
        .auction-front-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .auction-stage-button-row { display: grid; gap: 10px; margin-top: 16px; }
        .auction-secondary-action { border-radius: 12px; border: 1px solid rgba(96,165,250,0.26); background: rgba(15,23,42,0.72); color: #dcecff; padding: 12px 14px; font-weight: 700; }
        .auction-card-action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
        .auction-card-action-grid.is-single { grid-template-columns: 1fr; }
        .destruction-auction-manager.is-live-mode .destruction-auction-summary { grid-template-columns: repeat(5, minmax(160px, 1fr)); }
        .destruction-auction-manager.is-live-mode .destruction-auction-layout { grid-template-columns: minmax(720px, 1.35fr) minmax(420px, 0.75fr); }
        .destruction-auction-manager.is-live-mode .auction-control-panel { background: rgba(7,16,35,0.82); }
        .auction-card-view-button { min-height: 46px; border: 1px solid rgba(96,165,250,0.36); box-shadow: 0 14px 32px rgba(37,99,235,0.12); letter-spacing: 0.02em; }
        .auction-preview-fullscreen-button { min-height: 46px; border: 1px solid rgba(125,211,252,0.44); background: linear-gradient(135deg, rgba(37,99,235,0.96), rgba(14,165,233,0.92)); color: #fff; box-shadow: 0 14px 32px rgba(14,165,233,0.18); letter-spacing: 0.02em; }
        .auction-preview-fullscreen-button::after { content: "↗"; margin-left: 8px; font-size: 13px; opacity: 0.9; }

        .gacha-overlay { position: fixed; inset: 0; z-index: 2147483000; background: rgba(1,6,20,0.86); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; padding: 28px; }
        .gacha-overlay-card { position: relative; width: min(1160px, calc(100vw - 56px)); height: min(820px, calc(100vh - 56px)); min-height: 680px; border-radius: 28px; border: 1px solid rgba(96,165,250,0.28); background: linear-gradient(180deg, rgba(5,11,28,0.98), rgba(8,16,35,0.96)); box-shadow: 0 30px 80px rgba(0,0,0,0.54); overflow: hidden; box-sizing: border-box; }
        .gacha-overlay-card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at center, rgba(59,130,246,0.16), transparent 48%), linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent); opacity: 0.95; }
        .gacha-overlay-card::after { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px); background-size: 22px 22px; mask-image: radial-gradient(circle at center, #000 48%, transparent 92%); opacity: 0.5; }
        .gacha-close { position: absolute; top: 20px; right: 20px; z-index: 5; border: 1px solid rgba(255,255,255,0.12); background: rgba(7,16,35,0.72); color: #f8fbff; border-radius: 999px; width: 42px; height: 42px; font-size: 18px; font-weight: 900; }
        .gacha-layout { position: relative; z-index: 1; height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(380px, 440px); max-width: 1280px; margin: 0 auto; border-left: 1px solid rgba(96,165,250,0.28); border-right: 1px solid rgba(96,165,250,0.28); }
        .gacha-showcase { position: relative; overflow: hidden; padding: 32px; display: flex; align-items: center; justify-content: center; height: 100%; min-height: 0; box-sizing: border-box; }
        .gacha-panel { padding: 80px 28px 28px; border-left: 1px solid rgba(96,165,250,0.16); background: linear-gradient(180deg, rgba(7,17,37,0.82), rgba(6,16,34,0.96)); position: relative; z-index: 1; height: 100%; overflow: hidden; display: flex; flex-direction: column; box-sizing: border-box; }
        .gacha-panel-title { font-size: 24px; font-weight: 900; color: #f8fbff; margin: 0 0 8px; }
        .gacha-panel-desc { color: #9fbcdf; margin: 0 0 18px; line-height: 1.55; }
        .gacha-panel-chip { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; border: 1px solid rgba(96,165,250,0.16); background: rgba(7,16,35,0.62); color: #dcecff; padding: 8px 12px; font-size: 13px; margin-bottom: 16px; }
        .gacha-showcase-stage { position: relative; width: min(100%, 740px); height: 100%; min-height: 0; display: flex; align-items: center; justify-content: center; isolation: isolate; }
        .gacha-ring { position: absolute; width: 560px; height: 560px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--tier-border) 52%, rgba(96,165,250,0.22)); box-shadow: inset 0 0 110px color-mix(in srgb, var(--tier-glow) 24%, transparent), 0 0 80px color-mix(in srgb, var(--tier-glow) 24%, transparent); animation: ringFloat 5.6s ease-in-out infinite; }
        .gacha-light-burst { position: absolute; width: 760px; height: 760px; border-radius: 999px; background: radial-gradient(circle, rgba(59,130,246,0.42) 0%, rgba(59,130,246,0.12) 28%, rgba(15,23,42,0) 68%); opacity: 0.52; transform: scale(0.82); transition: opacity 640ms ease, transform 1200ms cubic-bezier(.22,.9,.22,1); filter: blur(4px); }
        .gacha-overlay.revealed .gacha-light-burst { opacity: 1; transform: scale(1.2); }
        .gacha-speedlines { position: absolute; inset: 0; overflow: hidden; }
        .gacha-speedlines::before, .gacha-speedlines::after { content: ""; position: absolute; inset: 8% -22%; background: repeating-linear-gradient(118deg, transparent 0 32px, color-mix(in srgb, var(--tier-accent) 92%, rgba(255,255,255,0.08)) 32px 42px, transparent 42px 78px); opacity: 0.72; mix-blend-mode: screen; }
        .gacha-overlay.animating .gacha-speedlines::before { animation: speedMoveA 0.88s linear infinite; }
        .gacha-overlay.animating .gacha-speedlines::after { animation: speedMoveB 1s linear infinite; }
        .gacha-shockwave { position: absolute; width: 240px; height: 240px; border-radius: 999px; border: 2px solid color-mix(in srgb, var(--tier-border) 55%, transparent); opacity: 0; }
        .gacha-overlay.revealed .gacha-shockwave { animation: shockwave 1s ease-out 0.06s both; }
        .gacha-sparkles { position: absolute; inset: 0; pointer-events: none; }
        .gacha-sparkles span { position: absolute; width: 8px; height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--tier-primary) 72%, white); box-shadow: 0 0 18px color-mix(in srgb, var(--tier-glow) 80%, transparent); opacity: 0; }
        .gacha-sparkles span:nth-child(1) { top: 14%; left: 44%; } .gacha-sparkles span:nth-child(2) { top: 22%; left: 68%; } .gacha-sparkles span:nth-child(3) { top: 34%; left: 20%; } .gacha-sparkles span:nth-child(4) { top: 46%; left: 76%; } .gacha-sparkles span:nth-child(5) { top: 58%; left: 24%; } .gacha-sparkles span:nth-child(6) { top: 72%; left: 62%; } .gacha-sparkles span:nth-child(7) { top: 18%; left: 56%; } .gacha-sparkles span:nth-child(8) { top: 62%; left: 74%; } .gacha-sparkles span:nth-child(9) { top: 76%; left: 34%; } .gacha-sparkles span:nth-child(10) { top: 40%; left: 52%; }
        .gacha-overlay.animating .gacha-sparkles span { animation: sparkleDrift 1.6s ease-in-out infinite; }
        .gacha-overlay.animating.high-tier .gacha-sparkles span { animation-duration: 1.1s; }
        .gacha-sparkles span:nth-child(2n) { animation-delay: 0.18s; } .gacha-sparkles span:nth-child(3n) { animation-delay: 0.34s; } .gacha-sparkles span:nth-child(5n) { animation-delay: 0.55s; }
        .gacha-deck-cluster { position: absolute; width: 660px; height: 290px; transform-style: preserve-3d; z-index: 1; }
        .gacha-card-back { position: absolute; left: calc(50% - 76px); top: calc(50% - 106px); width: 152px; height: 212px; border-radius: 22px; border: 1px solid rgba(125,211,252,0.34); background-color: #153a76; background-image: linear-gradient(145deg, #4f8df7 0%, #1e4f9f 46%, #071634 100%); box-shadow: 0 24px 52px rgba(0,0,0,0.52), inset 0 0 28px rgba(255,255,255,0.10), 0 0 36px rgba(96,165,250,0.34); overflow: hidden; will-change: transform, opacity, filter; }
        .gacha-card-back::before { content: ""; position: absolute; inset: 14px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent 24%, transparent 76%, rgba(255,255,255,0.04)); }
        .gacha-card-back::after { content: "K"; position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255,255,255,0.96); font-size: 60px; font-weight: 900; letter-spacing: 0.08em; text-shadow: 0 16px 34px rgba(0,0,0,0.35), 0 0 22px var(--tier-text-glow); }
        .gacha-card-back.card-1 { --x: -308px; --r: -16deg; --d: 0ms; opacity: 0; transform: translate(-308px, 46px) rotate(-16deg) scale(.78); } .gacha-card-back.card-2 { --x: -231px; --r: -11deg; --d: 70ms; opacity: 0; transform: translate(-231px, 46px) rotate(-11deg) scale(.78); } .gacha-card-back.card-3 { --x: -154px; --r: -7deg; --d: 140ms; opacity: 0; transform: translate(-154px, 46px) rotate(-7deg) scale(.78); } .gacha-card-back.card-4 { --x: -77px; --r: -3deg; --d: 210ms; opacity: 0; transform: translate(-77px, 46px) rotate(-3deg) scale(.78); } .gacha-card-back.card-5 { --x: 0px; --r: 0deg; --d: 280ms; opacity: 0; transform: translate(0, 46px) rotate(0deg) scale(.78); } .gacha-card-back.card-6 { --x: 77px; --r: 3deg; --d: 350ms; opacity: 0; transform: translate(77px, 46px) rotate(3deg) scale(.78); } .gacha-card-back.card-7 { --x: 154px; --r: 7deg; --d: 420ms; opacity: 0; transform: translate(154px, 46px) rotate(7deg) scale(.78); } .gacha-card-back.card-8 { --x: 231px; --r: 11deg; --d: 490ms; opacity: 0; transform: translate(231px, 46px) rotate(11deg) scale(.78); } .gacha-card-back.card-9 { --x: 308px; --r: 16deg; --d: 560ms; opacity: 0; transform: translate(308px, 46px) rotate(16deg) scale(.78); }
        .gacha-overlay.animating .gacha-deck-cluster { animation: lineDeckSweep 5.4s ease-in-out both; } .gacha-overlay.animating.high-tier .gacha-deck-cluster { animation-duration: 6.5s; } .gacha-overlay.animating .gacha-card-back { animation: lineFanOut 1.38s cubic-bezier(.16,.88,.2,1) both, lineCardBreath 1.9s ease-in-out infinite; animation-delay: var(--d), calc(1.44s + var(--d)); } .gacha-overlay.animating.high-tier .gacha-card-back { animation-name: lineFanOut, lineCardBreathHigh; } .gacha-overlay.revealed .gacha-deck-cluster { opacity: 0.08; transform: translateY(36px) scale(0.8); transition: opacity 0.8s ease, transform 0.8s ease; }
        .gacha-picked-shell { position: relative; width: min(88vw, 430px); height: min(76vh, 590px); perspective: 1800px; z-index: 3; }
        .gacha-picked-path { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .gacha-picked-card { width: 100%; height: 100%; transform-origin: center; opacity: 0; filter: drop-shadow(0 0 12px var(--tier-glow)); will-change: transform, opacity, filter; }
        .gacha-overlay.animating .gacha-picked-card { animation: selectedLineCard 5.8s cubic-bezier(.16,.92,.18,1) forwards; }
        .gacha-overlay.animating.high-tier .gacha-picked-card { animation: selectedLineCardHigh 6.9s cubic-bezier(.16,.94,.18,1) forwards; }
        .gacha-card-inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 1.85s cubic-bezier(.16,.86,.18,1.06); }
        .gacha-overlay.revealed .gacha-picked-card { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        .gacha-overlay.revealed .gacha-card-inner { transform: rotateY(180deg); }
        .gacha-overlay.revealed.high-tier .gacha-card-inner { transition-duration: 2.75s; }
        .gacha-card-face { position: absolute; inset: 0; border-radius: 28px; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; }
        .gacha-card-face.back { background-color: #153a76; background-image: linear-gradient(145deg, #4f8df7 0%, #1e4f9f 48%, #071634 100%); border: 1px solid rgba(125,211,252,0.38); box-shadow: 0 32px 76px rgba(0,0,0,0.62), inset 0 0 28px rgba(255,255,255,0.10), 0 0 48px rgba(96,165,250,0.42); }
        .gacha-card-face.back::before { content: ""; position: absolute; inset: 16px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.08); }
        .gacha-card-face.back::after { content: "K"; position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255,255,255,0.96); font-size: 112px; font-weight: 900; letter-spacing: 0.08em; text-shadow: 0 16px 34px rgba(0,0,0,0.35), 0 0 26px var(--tier-text-glow); }
        .gacha-card-face.front { transform: rotateY(180deg); border: 3px solid var(--card-tier-border); background-color: #10243a; background-image: radial-gradient(circle at 72% 18%, rgba(255,255,255,0.12), transparent 24%), linear-gradient(165deg, #183a4a 0%, #12314a 46%, #06101f 100%); box-shadow: 0 0 0 1px rgba(255,255,255,0.10) inset, 0 32px 92px rgba(0,0,0,0.72), 0 0 64px var(--card-tier-glow); padding: 26px; display: grid; grid-template-rows: auto 1fr; align-content: stretch; gap: 22px; opacity: 1; }
        .gacha-card-face.front::before { content: ""; position: absolute; inset: 0; z-index: 0; background-image: radial-gradient(circle at top left, rgba(255,255,255,0.10), transparent 28%), radial-gradient(circle at 72% 10%, var(--card-tier-glow), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.06), transparent 30%, rgba(255,255,255,0.02)); opacity: 0.92; pointer-events: none; }
        .gacha-card-face.front > * { position: relative; z-index: 2; }
        .gacha-overlay.high-tier .gacha-card-face.front::after { content: ""; position: absolute; inset: -24%; z-index: 1; background: conic-gradient(from 90deg, transparent 0deg, var(--card-tier-glow) 36deg, transparent 78deg, var(--card-tier-glow) 132deg, transparent 196deg, var(--card-tier-glow) 280deg, transparent 320deg); animation: highTierAura 6s linear infinite; opacity: 0.36; pointer-events: none; }
        .gacha-card-visual { position: relative; z-index: 1; display: grid; grid-template-columns: 84px minmax(0, 1fr) 142px; gap: 16px; align-items: center; padding-top: 26px; }
        .gacha-position-icon { width: 72px; height: 72px; object-fit: cover; border-radius: 999px; filter: drop-shadow(0 0 14px color-mix(in srgb, var(--position-glow) 44%, transparent)); }
        .gacha-tier-image { width: 108px; height: 108px; object-fit: cover; border-radius: 999px; filter: drop-shadow(0 0 22px color-mix(in srgb, var(--card-tier-glow) 58%, transparent)); }
        .gacha-tier-icon-wrap { width: 136px; height: 136px; justify-self: end; border-radius: 999px; border: 2px solid var(--card-tier-border); background-color: #071625; display: grid; place-items: center; overflow: hidden; box-shadow: 0 0 34px var(--card-tier-glow); flex-shrink: 0; }
        .gacha-position-float { position: static; z-index: 2; }
        .gacha-position-icon-wrap { width: 84px; height: 84px; border-radius: 999px; border: 2px solid var(--position-border); background-color: #071625; display: grid; place-items: center; overflow: hidden; box-shadow: 0 0 28px var(--position-glow); }
        .gacha-card-stats { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr; gap: 12px; align-self: stretch; margin-top: 0; padding-top: 4px; }
        .gacha-card-head { display: grid; gap: 7px; align-items: center; min-width: 0; }
        .gacha-card-head-text { display: grid; gap: 4px; min-width: 0; }
        .gacha-card-head-name { font-size: 34px; font-weight: 900; color: #ffffff; text-shadow: 0 0 18px var(--card-tier-text-glow); line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gacha-card-head-nick { font-size: 15px; color: #c8dbf3; word-break: break-all; opacity: 0.94; }
        .gacha-flip-flash { position: absolute; inset: 8% 14%; border-radius: 28px; background: radial-gradient(circle, rgba(255,255,255,0.78), rgba(255,255,255,0.12) 34%, rgba(255,255,255,0) 74%); opacity: 0; pointer-events: none; mix-blend-mode: screen; }
        .gacha-overlay.revealed .gacha-flip-flash { animation: flipFlash 1.4s ease-out 0.1s both; }
        .gacha-right-form { margin-top: 18px; min-height: 194px; transition: opacity 260ms ease; }
        .gacha-right-form.is-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
        .gacha-right-form.is-visible { opacity: 1; visibility: visible; pointer-events: auto; }

        .gacha-card-face.front,
        .gacha-card-face.back,
        .gacha-card-back,
        .gacha-card-face.front .auction-front-stat {
          opacity: 1;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }
        .gacha-overlay.revealed .gacha-card-face.front {
          background-color: #10243a !important;
          border-color: var(--card-tier-border) !important;
        }
        .gacha-overlay.revealed .gacha-card-face.front .auction-front-stat {
          background-color: #0b1d31 !important;
        }
        .gacha-overlay.animating .gacha-card-back,
        .gacha-overlay.animating .gacha-card-face.back {
          background-color: #153a76 !important;
        }



        /* K-LOL.GG auction visual rework: opaque card, stronger shuffle, high-tier effects */
        .gacha-overlay { background: #020817; backdrop-filter: none; }
        .gacha-overlay-card {
          border: 1px solid rgba(96,165,250,0.34);
          background: #061225;
          box-shadow: 0 34px 110px rgba(0,0,0,0.76), 0 0 70px rgba(37,99,235,0.14);
        }
        .gacha-overlay.high-tier .gacha-overlay-card {
          border-color: color-mix(in srgb, var(--card-tier-border) 58%, rgba(147,197,253,0.36));
          box-shadow: 0 34px 120px rgba(0,0,0,0.82), 0 0 84px color-mix(in srgb, var(--card-tier-glow) 46%, transparent);
        }
        .gacha-showcase {
          background:
            radial-gradient(circle at 50% 48%, rgba(59,130,246,0.18), transparent 42%),
            linear-gradient(180deg, #071529 0%, #050c1b 100%);
        }
        .gacha-panel {
          background: #061020;
          border-left-color: rgba(96,165,250,0.22);
        }
        .gacha-showcase-stage {
          width: min(100%, 760px);
          overflow: visible;
        }
        .gacha-ring {
          width: 620px;
          height: 620px;
          border: 1px solid rgba(96,165,250,0.34);
          box-shadow: inset 0 0 80px rgba(59,130,246,0.14), 0 0 44px rgba(59,130,246,0.20);
        }
        .gacha-overlay.high-tier .gacha-ring {
          border-color: color-mix(in srgb, var(--card-tier-border) 60%, rgba(255,255,255,0.2));
          box-shadow: inset 0 0 110px color-mix(in srgb, var(--card-tier-glow) 34%, transparent), 0 0 70px color-mix(in srgb, var(--card-tier-glow) 38%, transparent);
          animation: ringFloat 3.4s ease-in-out infinite;
        }
        .gacha-light-burst {
          background: radial-gradient(circle, rgba(59,130,246,0.32) 0%, rgba(59,130,246,0.12) 34%, transparent 70%);
          filter: blur(8px);
          opacity: 0.78;
        }
        .gacha-overlay.high-tier .gacha-light-burst {
          background: radial-gradient(circle, color-mix(in srgb, var(--card-tier-glow) 82%, rgba(255,255,255,0.1)) 0%, color-mix(in srgb, var(--card-tier-primary) 22%, transparent) 34%, transparent 72%);
          filter: blur(6px) saturate(1.35);
        }
        .gacha-speedlines::before,
        .gacha-speedlines::after {
          background: repeating-linear-gradient(105deg, transparent 0 30px, rgba(125,211,252,0.16) 30px 40px, transparent 40px 78px);
          opacity: 0.38;
        }
        .gacha-overlay.high-tier .gacha-speedlines::before,
        .gacha-overlay.high-tier .gacha-speedlines::after {
          background: repeating-linear-gradient(105deg, transparent 0 26px, color-mix(in srgb, var(--card-tier-glow) 52%, rgba(255,255,255,0.12)) 26px 38px, transparent 38px 72px);
          opacity: 0.58;
        }
        .gacha-sparkles span {
          width: 10px;
          height: 10px;
          background: #bfdbfe;
          box-shadow: 0 0 20px rgba(125,211,252,0.72), 0 0 40px rgba(59,130,246,0.34);
        }
        .gacha-overlay.high-tier .gacha-sparkles span {
          background: color-mix(in srgb, var(--card-tier-primary) 72%, white);
          box-shadow: 0 0 26px color-mix(in srgb, var(--card-tier-glow) 88%, transparent), 0 0 52px color-mix(in srgb, var(--card-tier-glow) 52%, transparent);
        }
        .gacha-deck-cluster {
          width: 760px;
          height: 320px;
          z-index: 2;
        }
        .gacha-card-back {
          left: calc(50% - 78px);
          top: calc(50% - 108px);
          width: 156px;
          height: 216px;
          opacity: 1;
          border-radius: 24px;
          border: 2px solid #5ea0ff;
          background-color: #123b82 !important;
          background-image:
            linear-gradient(145deg, #62a0ff 0%, #235db8 42%, #07142e 100%) !important;
          box-shadow:
            0 26px 64px rgba(0,0,0,0.62),
            inset 0 0 26px rgba(255,255,255,0.13),
            0 0 34px rgba(96,165,250,0.42);
        }
        .gacha-card-back::before {
          inset: 13px;
          border-radius: 18px;
          border: 1px solid rgba(219,234,254,0.22);
          background:
            linear-gradient(135deg, rgba(255,255,255,0.18), transparent 28%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 8px, transparent 8px 18px);
        }
        .gacha-card-back::after {
          font-size: 64px;
          text-shadow: 0 10px 28px rgba(0,0,0,0.42), 0 0 24px rgba(191,219,254,0.45);
        }
        .gacha-overlay.high-tier .gacha-card-back {
          border-color: var(--card-tier-border);
          background-color: #14324c !important;
          background-image:
            radial-gradient(circle at 55% 18%, rgba(255,255,255,0.18), transparent 24%),
            linear-gradient(145deg, color-mix(in srgb, var(--card-tier-primary) 72%, #ffffff) 0%, color-mix(in srgb, var(--card-tier-secondary) 66%, #0f172a) 48%, #050b18 100%) !important;
          box-shadow:
            0 30px 74px rgba(0,0,0,0.70),
            inset 0 0 30px rgba(255,255,255,0.16),
            0 0 46px color-mix(in srgb, var(--card-tier-glow) 64%, transparent);
        }
        .gacha-card-back.card-1 { --x: -330px; --r: -18deg; --d: 0ms; opacity: 0; transform: translate(-520px, 74px) rotate(-26deg) scale(.52); }
        .gacha-card-back.card-2 { --x: -248px; --r: -13deg; --d: 80ms; opacity: 0; transform: translate(-520px, 74px) rotate(-24deg) scale(.52); }
        .gacha-card-back.card-3 { --x: -166px; --r: -8deg; --d: 160ms; opacity: 0; transform: translate(-520px, 74px) rotate(-22deg) scale(.52); }
        .gacha-card-back.card-4 { --x: -83px; --r: -3deg; --d: 240ms; opacity: 0; transform: translate(-520px, 74px) rotate(-20deg) scale(.52); }
        .gacha-card-back.card-5 { --x: 0px; --r: 0deg; --d: 320ms; opacity: 0; transform: translate(-520px, 74px) rotate(-18deg) scale(.52); }
        .gacha-card-back.card-6 { --x: 83px; --r: 3deg; --d: 400ms; opacity: 0; transform: translate(-520px, 74px) rotate(-16deg) scale(.52); }
        .gacha-card-back.card-7 { --x: 166px; --r: 8deg; --d: 480ms; opacity: 0; transform: translate(-520px, 74px) rotate(-14deg) scale(.52); }
        .gacha-card-back.card-8 { --x: 248px; --r: 13deg; --d: 560ms; opacity: 0; transform: translate(-520px, 74px) rotate(-12deg) scale(.52); }
        .gacha-card-back.card-9 { --x: 330px; --r: 18deg; --d: 640ms; opacity: 0; transform: translate(-520px, 74px) rotate(-10deg) scale(.52); }
        .gacha-overlay.animating .gacha-deck-cluster { animation: lineDeckSweep 6.2s cubic-bezier(.16,.86,.2,1) both; }
        .gacha-overlay.animating.high-tier .gacha-deck-cluster { animation-duration: 7.4s; }
        .gacha-overlay.animating .gacha-card-back {
          animation:
            lineFanOut 2.18s cubic-bezier(.16,.88,.18,1) both,
            lineCardBreath 1.4s ease-in-out infinite;
          animation-delay: var(--d), calc(2.2s + var(--d));
        }
        .gacha-overlay.animating.high-tier .gacha-card-back {
          animation-name: lineFanOut, lineCardBreathHigh;
          animation-duration: 2.38s, 1.05s;
        }
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0;
          transform: translateY(72px) scale(.76);
          transition: opacity .7s ease, transform .7s ease;
        }
        .gacha-picked-shell {
          width: min(88vw, 440px);
          height: min(76vh, 610px);
        }
        .gacha-picked-card { filter: drop-shadow(0 0 20px rgba(96,165,250,0.34)); }
        .gacha-overlay.animating .gacha-picked-card { animation: selectedLineCard 6.2s cubic-bezier(.16,.92,.18,1) forwards; }
        .gacha-overlay.animating.high-tier .gacha-picked-card { animation: selectedLineCardHigh 7.4s cubic-bezier(.16,.94,.18,1) forwards; filter: drop-shadow(0 0 28px var(--card-tier-glow)); }
        .gacha-card-inner { transition: transform 2.05s cubic-bezier(.16,.86,.18,1.06); }
        .gacha-overlay.revealed.high-tier .gacha-card-inner { transition-duration: 3.1s; }
        .gacha-card-face.back {
          border: 2px solid #5ea0ff;
          background-color: #123b82 !important;
          background-image: linear-gradient(145deg, #62a0ff 0%, #235db8 44%, #07142e 100%) !important;
          box-shadow: 0 36px 84px rgba(0,0,0,0.70), inset 0 0 30px rgba(255,255,255,0.14), 0 0 52px rgba(96,165,250,0.46);
        }
        .gacha-overlay.high-tier .gacha-card-face.back {
          border-color: var(--card-tier-border);
          background-color: #14324c !important;
          background-image: linear-gradient(145deg, color-mix(in srgb, var(--card-tier-primary) 72%, #ffffff) 0%, color-mix(in srgb, var(--card-tier-secondary) 68%, #0f172a) 48%, #050b18 100%) !important;
          box-shadow: 0 40px 92px rgba(0,0,0,0.76), inset 0 0 34px rgba(255,255,255,0.16), 0 0 62px color-mix(in srgb, var(--card-tier-glow) 70%, transparent);
        }
        .gacha-card-face.front {
          border: 3px solid var(--card-tier-border);
          background-color: #0b1628 !important;
          background-image:
            radial-gradient(circle at 76% 14%, color-mix(in srgb, var(--card-tier-glow) 40%, transparent), transparent 28%),
            linear-gradient(160deg, color-mix(in srgb, var(--card-tier-secondary) 22%, #14273f) 0%, #0e2238 46%, #050b16 100%) !important;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.12) inset,
            0 34px 92px rgba(0,0,0,0.78),
            0 0 68px color-mix(in srgb, var(--card-tier-glow) 62%, transparent);
          opacity: 1 !important;
        }
        .gacha-card-face.front::before {
          opacity: 1;
          background-image:
            linear-gradient(135deg, rgba(255,255,255,0.12), transparent 26%),
            radial-gradient(circle at 74% 12%, color-mix(in srgb, var(--card-tier-glow) 48%, transparent), transparent 30%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 8px, transparent 8px 18px);
        }
        .gacha-overlay.high-tier .gacha-card-face.front {
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.14) inset,
            0 38px 104px rgba(0,0,0,0.82),
            0 0 86px color-mix(in srgb, var(--card-tier-glow) 78%, transparent),
            0 0 120px color-mix(in srgb, var(--card-tier-glow) 38%, transparent);
        }
        .gacha-overlay.high-tier .gacha-card-face.front::after {
          opacity: 0.55;
          filter: blur(1px) saturate(1.3);
          animation: highTierAura 4.8s linear infinite;
        }
        .gacha-card-face.front .auction-front-stat {
          background-color: #09182c !important;
          background-image: linear-gradient(135deg, rgba(37,99,235,0.18), #071225 72%) !important;
          border: 1px solid rgba(125,211,252,0.34);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 30px rgba(0,0,0,0.32);
        }
        .gacha-overlay.high-tier .gacha-card-face.front .auction-front-stat {
          border-color: color-mix(in srgb, var(--card-tier-border) 58%, rgba(125,211,252,0.3));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 34px rgba(0,0,0,0.36), 0 0 20px color-mix(in srgb, var(--card-tier-glow) 22%, transparent);
        }
        .gacha-tier-icon-wrap,
        .gacha-position-icon-wrap {
          background-color: #050d1b !important;
          box-shadow: 0 0 34px color-mix(in srgb, var(--card-tier-glow) 38%, transparent), 0 12px 26px rgba(0,0,0,0.36);
        }
        @keyframes lineDeckSweep {
          0% { transform: translateX(-80px) translateY(40px) scale(.88); filter: brightness(.72); }
          18% { transform: translateX(0) translateY(28px) scale(.96); filter: brightness(1); }
          46% { transform: translateX(44px) translateY(4px) scale(1.04); filter: brightness(1.16); }
          72% { transform: translateX(-18px) translateY(8px) scale(1.02); filter: brightness(1.08); }
          100% { transform: translateX(0) translateY(34px) scale(.92); filter: brightness(.88); }
        }
        @keyframes lineFanOut {
          0% { opacity: 0; transform: translate(-560px, 88px) rotate(-24deg) scale(.5); }
          34% { opacity: 1; transform: translate(calc(var(--x) * .38), 40px) rotate(calc(var(--r) * .22)) scale(.68); }
          64% { opacity: 1; transform: translate(calc(var(--x) * 1.06), -8px) rotate(calc(var(--r) * 1.08)) scale(.86); }
          100% { opacity: .96; transform: translate(var(--x), 12px) rotate(var(--r)) scale(.82); }
        }
        @keyframes lineCardBreath { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.26) saturate(1.1); } }
        @keyframes lineCardBreathHigh { 0%,100% { filter: brightness(1.02) saturate(1.1) drop-shadow(0 0 6px var(--card-tier-glow)); } 50% { filter: brightness(1.48) saturate(1.35) drop-shadow(0 0 24px var(--card-tier-glow)); } }
        @keyframes selectedLineCard {
          0% { opacity: 0; transform: translate3d(0, 148px, 0) scale(.26) rotate(0deg); }
          34% { opacity: 0; transform: translate3d(0, 148px, 0) scale(.26) rotate(0deg); }
          48% { opacity: 1; transform: translate3d(0, 96px, 0) scale(.52) rotate(-3deg); }
          64% { opacity: 1; transform: translate3d(0, -18px, 0) scale(.82) rotate(3deg); }
          78% { opacity: 1; transform: translate3d(0, -72px, 0) scale(1.04) rotate(-2deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }
        @keyframes selectedLineCardHigh {
          0% { opacity: 0; transform: translate3d(0, 164px, 0) scale(.22) rotate(0deg); }
          38% { opacity: 0; transform: translate3d(0, 164px, 0) scale(.22) rotate(0deg); }
          52% { opacity: 1; transform: translate3d(0, 104px, 0) scale(.5) rotate(-5deg); }
          68% { opacity: 1; transform: translate3d(0, -24px, 0) scale(.86) rotate(5deg); }
          84% { opacity: 1; transform: translate3d(0, -88px, 0) scale(1.09) rotate(-3deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }

        /* K-LOL.GG final tier-color card pass: no separate high-tier visual mode */
        .gacha-overlay-card {
          border-color: rgba(96,165,250,0.34) !important;
          background: #061225 !important;
          box-shadow: 0 34px 110px rgba(0,0,0,0.76), 0 0 70px rgba(37,99,235,0.14) !important;
        }
        .gacha-showcase {
          background:
            radial-gradient(circle at 50% 46%, color-mix(in srgb, var(--card-tier-glow) 30%, transparent), transparent 42%),
            linear-gradient(180deg, #071529 0%, #050c1b 100%) !important;
        }
        .gacha-panel {
          background: #061020 !important;
          border-left-color: rgba(96,165,250,0.22) !important;
        }
        .gacha-ring {
          border-color: color-mix(in srgb, var(--card-tier-border) 42%, rgba(96,165,250,0.26)) !important;
          box-shadow:
            inset 0 0 90px color-mix(in srgb, var(--card-tier-glow) 24%, transparent),
            0 0 52px color-mix(in srgb, var(--card-tier-glow) 26%, transparent) !important;
          animation: ringFloat 5.2s ease-in-out infinite !important;
        }
        .gacha-light-burst {
          background:
            radial-gradient(circle,
              color-mix(in srgb, var(--card-tier-glow) 58%, rgba(255,255,255,0.08)) 0%,
              color-mix(in srgb, var(--card-tier-primary) 18%, transparent) 34%,
              transparent 72%) !important;
          filter: blur(7px) saturate(1.1) !important;
          opacity: 0.82 !important;
        }
        .gacha-speedlines::before,
        .gacha-speedlines::after {
          background: repeating-linear-gradient(105deg,
            transparent 0 30px,
            color-mix(in srgb, var(--card-tier-glow) 34%, rgba(255,255,255,0.08)) 30px 40px,
            transparent 40px 78px) !important;
          opacity: 0.42 !important;
        }
        .gacha-sparkles span {
          background: color-mix(in srgb, var(--card-tier-primary) 68%, #ffffff) !important;
          box-shadow:
            0 0 18px color-mix(in srgb, var(--card-tier-glow) 70%, transparent),
            0 0 36px color-mix(in srgb, var(--card-tier-glow) 34%, transparent) !important;
        }
        .gacha-card-back,
        .gacha-card-face.back {
          border-color: var(--card-tier-border) !important;
          background-color: color-mix(in srgb, var(--card-tier-secondary) 72%, #071225) !important;
          background-image:
            radial-gradient(circle at 54% 18%, color-mix(in srgb, var(--card-tier-primary) 24%, #ffffff22), transparent 24%),
            linear-gradient(145deg,
              color-mix(in srgb, var(--card-tier-primary) 68%, #ffffff) 0%,
              color-mix(in srgb, var(--card-tier-secondary) 72%, #0f172a) 48%,
              #050b18 100%) !important;
          box-shadow:
            0 30px 74px rgba(0,0,0,0.70),
            inset 0 0 30px rgba(255,255,255,0.13),
            0 0 44px color-mix(in srgb, var(--card-tier-glow) 56%, transparent) !important;
          opacity: 1 !important;
        }
        .gacha-card-back::before,
        .gacha-card-face.back::before {
          border-color: rgba(255,255,255,0.18) !important;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.16), transparent 28%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.055) 0 8px, transparent 8px 18px) !important;
        }
        .gacha-card-back::after,
        .gacha-card-face.back::after {
          text-shadow:
            0 10px 28px rgba(0,0,0,0.42),
            0 0 24px color-mix(in srgb, var(--card-tier-glow) 55%, rgba(255,255,255,0.2)) !important;
        }
        .gacha-overlay.animating .gacha-deck-cluster {
          animation: lineDeckSweep 6.4s cubic-bezier(.16,.86,.2,1) both !important;
        }
        .gacha-overlay.animating .gacha-card-back {
          animation:
            lineFanOut 2.2s cubic-bezier(.16,.88,.18,1) both,
            lineCardBreath 1.45s ease-in-out infinite !important;
          animation-delay: var(--d), calc(2.24s + var(--d)) !important;
        }
        .gacha-overlay.animating .gacha-picked-card {
          animation: selectedLineCard 6.4s cubic-bezier(.16,.92,.18,1) forwards !important;
          filter: drop-shadow(0 0 24px color-mix(in srgb, var(--card-tier-glow) 54%, transparent)) !important;
        }
        .gacha-card-inner {
          transition: transform 2.2s cubic-bezier(.16,.86,.18,1.06) !important;
        }
        .gacha-card-face.front {
          border-color: var(--card-tier-border) !important;
          background-color: color-mix(in srgb, var(--card-tier-secondary) 56%, #071225) !important;
          background-image:
            radial-gradient(circle at 76% 14%, color-mix(in srgb, var(--card-tier-glow) 38%, transparent), transparent 28%),
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--card-tier-primary) 20%, transparent), transparent 30%),
            linear-gradient(160deg,
              color-mix(in srgb, var(--card-tier-secondary) 42%, #14273f) 0%,
              color-mix(in srgb, var(--card-tier-secondary) 28%, #0e2238) 48%,
              #050b16 100%) !important;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.12) inset,
            0 34px 92px rgba(0,0,0,0.78),
            0 0 68px color-mix(in srgb, var(--card-tier-glow) 60%, transparent) !important;
          opacity: 1 !important;
        }
        .gacha-card-face.front::before {
          opacity: 0.94 !important;
          background-image:
            linear-gradient(135deg, rgba(255,255,255,0.10), transparent 26%),
            radial-gradient(circle at 74% 12%, color-mix(in srgb, var(--card-tier-glow) 36%, transparent), transparent 30%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 8px, transparent 8px 18px) !important;
        }
        .gacha-card-face.front::after {
          content: "";
          position: absolute;
          inset: -24%;
          z-index: 1;
          background: conic-gradient(from 90deg,
            transparent 0deg,
            color-mix(in srgb, var(--card-tier-glow) 18%, transparent) 38deg,
            transparent 82deg,
            color-mix(in srgb, var(--card-tier-glow) 14%, transparent) 142deg,
            transparent 222deg,
            color-mix(in srgb, var(--card-tier-glow) 12%, transparent) 292deg,
            transparent 330deg);
          opacity: 0.24 !important;
          animation: none !important;
          filter: none !important;
          pointer-events: none;
        }
        .gacha-card-face.front .auction-front-stat {
          background-color: color-mix(in srgb, var(--card-tier-secondary) 40%, #07182b) !important;
          background-image:
            linear-gradient(135deg, color-mix(in srgb, var(--card-tier-primary) 11%, transparent), #071225 78%) !important;
          border-color: color-mix(in srgb, var(--card-tier-border) 46%, rgba(125,211,252,0.26)) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 16px 30px rgba(0,0,0,0.32) !important;
        }
        .gacha-tier-icon-wrap,
        .gacha-position-icon-wrap {
          background-color: color-mix(in srgb, var(--card-tier-secondary) 52%, #050d1b) !important;
          border-color: var(--card-tier-border) !important;
          box-shadow:
            0 0 30px color-mix(in srgb, var(--card-tier-glow) 42%, transparent),
            0 12px 26px rgba(0,0,0,0.36) !important;
        }
        .gacha-overlay.high-tier .gacha-overlay-card,
        .gacha-overlay.high-tier .gacha-ring,
        .gacha-overlay.high-tier .gacha-light-burst,
        .gacha-overlay.high-tier .gacha-card-back,
        .gacha-overlay.high-tier .gacha-card-face.back,
        .gacha-overlay.high-tier .gacha-card-face.front,
        .gacha-overlay.high-tier .gacha-card-face.front .auction-front-stat {
          animation-duration: inherit !important;
        }



        /* K-LOL.GG final tier front-face pass: stronger tier front colors + mid-shuffle high-tier suspense */
        .gacha-overlay {
          --front-top: #15304d;
          --front-mid: #0f233a;
          --front-bottom: #08111d;
          --stat-top: #11263d;
          --stat-bottom: #091423;
          --special-tier-a: #7dd3fc;
          --special-tier-b: #2563eb;
          --special-tier-c: rgba(255,255,255,0.72);
        }
        .gacha-overlay.tier-iron { --front-top: #303946; --front-mid: #1f2937; --front-bottom: #0b1018; --stat-top: #252f3d; --stat-bottom: #101821; --special-tier-a: #cbd5e1; --special-tier-b: #64748b; }
        .gacha-overlay.tier-bronze { --front-top: #6f4218; --front-mid: #4a2309; --front-bottom: #160a05; --stat-top: #5a2d0c; --stat-bottom: #1a0e08; --special-tier-a: #f59e0b; --special-tier-b: #b45309; }
        .gacha-overlay.tier-silver { --front-top: #5e6d81; --front-mid: #314154; --front-bottom: #0f1722; --stat-top: #45576d; --stat-bottom: #141d28; --special-tier-a: #e2e8f0; --special-tier-b: #94a3b8; }
        .gacha-overlay.tier-gold { --front-top: #8b5f12; --front-mid: #5a350a; --front-bottom: #171005; --stat-top: #71480c; --stat-bottom: #1a1207; --special-tier-a: #fde047; --special-tier-b: #f59e0b; }
        .gacha-overlay.tier-platinum { --front-top: #17756e; --front-mid: #114354; --front-bottom: #08131b; --stat-top: #135b5a; --stat-bottom: #0a1621; --special-tier-a: #5eead4; --special-tier-b: #14b8a6; }
        .gacha-overlay.tier-emerald { --front-top: #0f6e56; --front-mid: #0d4738; --front-bottom: #071812; --stat-top: #125746; --stat-bottom: #091b17; --special-tier-a: #6ee7b7; --special-tier-b: #10b981; }
        .gacha-overlay.tier-diamond { --front-top: #14588a; --front-mid: #14395f; --front-bottom: #081422; --stat-top: #13486d; --stat-bottom: #091828; --special-tier-a: #67e8f9; --special-tier-b: #38bdf8; --special-tier-c: rgba(224,242,254,0.82); }
        .gacha-overlay.tier-master { --front-top: #5e2d9a; --front-mid: #3a1e68; --front-bottom: #11091e; --stat-top: #4c257f; --stat-bottom: #171026; --special-tier-a: #e9d5ff; --special-tier-b: #c084fc; --special-tier-c: rgba(243,232,255,0.84); }
        .gacha-overlay.tier-grandmaster { --front-top: #8e2036; --front-mid: #5a1525; --front-bottom: #17070d; --stat-top: #741b2f; --stat-bottom: #1d0a10; --special-tier-a: #fecaca; --special-tier-b: #ef4444; --special-tier-c: rgba(255,228,230,0.84); }
        .gacha-overlay.tier-challenger { --front-top: #7d6320; --front-mid: #4c3d1b; --front-bottom: #16110a; --stat-top: #705723; --stat-bottom: #1b140c; --special-tier-a: #fef3c7; --special-tier-b: #facc15; --special-tier-c: rgba(255,255,255,0.92); }

        .gacha-card-face.front {
          background-color: var(--front-mid) !important;
          background-image:
            radial-gradient(circle at 80% 14%, color-mix(in srgb, var(--card-tier-glow) 28%, transparent), transparent 26%),
            radial-gradient(circle at 18% 2%, color-mix(in srgb, var(--special-tier-a) 10%, transparent), transparent 24%),
            linear-gradient(165deg, var(--front-top) 0%, var(--front-mid) 48%, var(--front-bottom) 100%) !important;
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.11),
            0 34px 92px rgba(0,0,0,0.78),
            0 0 62px color-mix(in srgb, var(--card-tier-glow) 50%, transparent) !important;
        }
        .gacha-card-face.front::before {
          opacity: 0.96 !important;
          background-image:
            linear-gradient(135deg, rgba(255,255,255,0.11), transparent 26%),
            radial-gradient(circle at 74% 12%, color-mix(in srgb, var(--special-tier-a) 16%, transparent), transparent 24%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.026) 0 8px, transparent 8px 18px) !important;
        }
        .gacha-card-face.front .auction-front-stat {
          background-color: var(--stat-bottom) !important;
          background-image: linear-gradient(135deg, color-mix(in srgb, var(--special-tier-a) 8%, transparent), var(--stat-top) 18%, var(--stat-bottom) 100%) !important;
          border-color: color-mix(in srgb, var(--card-tier-border) 54%, rgba(255,255,255,0.18)) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.09), 0 16px 30px rgba(0,0,0,0.32) !important;
        }
        .gacha-card-face.front .auction-front-stat strong {
          text-shadow: 0 0 18px color-mix(in srgb, var(--card-tier-text-glow) 42%, transparent);
        }

        .gacha-overlay.animating.high-tier .gacha-showcase-stage::before,
        .gacha-overlay.animating.high-tier .gacha-showcase-stage::after,
        .gacha-overlay.animating.high-tier .gacha-picked-shell::before,
        .gacha-overlay.animating.high-tier .gacha-picked-shell::after {
          content: "";
          position: absolute;
          pointer-events: none;
          opacity: 0;
        }
        .gacha-overlay.animating.high-tier .gacha-showcase-stage::before {
          inset: 16% 8% 18%;
          border-radius: 999px;
          background: radial-gradient(circle, color-mix(in srgb, var(--special-tier-a) 16%, transparent) 0%, color-mix(in srgb, var(--special-tier-b) 10%, transparent) 30%, transparent 72%);
          filter: blur(18px);
          animation: highTierPremonition 1.35s ease-out 2.85s both;
        }
        .gacha-overlay.animating.high-tier .gacha-showcase-stage::after {
          inset: 0;
          background:
            radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--special-tier-a) 10%, transparent) 0%, transparent 42%),
            linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--special-tier-c) 10%, transparent) 50%, transparent 100%);
          animation: highTierSuspenseVeil 2.4s ease-in-out 3.25s both;
        }
        .gacha-overlay.animating.high-tier .gacha-picked-shell::before {
          inset: -10%;
          border-radius: 34px;
          border: 2px solid color-mix(in srgb, var(--special-tier-a) 52%, rgba(255,255,255,0.18));
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--special-tier-b) 0%, transparent);
          animation: highTierSelectionPulse 1.8s cubic-bezier(.2,.86,.18,1) 3.45s both;
        }
        .gacha-overlay.animating.high-tier .gacha-picked-shell::after {
          inset: -22%;
          border-radius: 999px;
          background: conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--special-tier-a) 18%, transparent) 54deg, transparent 112deg, color-mix(in srgb, var(--special-tier-b) 14%, transparent) 214deg, transparent 276deg, color-mix(in srgb, var(--special-tier-a) 20%, transparent) 332deg, transparent 360deg);
          filter: blur(4px);
          animation: highTierCrownSpin 2.6s linear 3.8s both;
        }
        .gacha-overlay.animating.high-tier .gacha-ring {
          animation: ringFloat 3.4s ease-in-out infinite, highTierRingFlare 1.7s ease-in-out 3.15s both !important;
        }
        .gacha-overlay.animating.high-tier .gacha-light-burst {
          animation: highTierBurst 1.5s ease-out 3.15s both;
        }
        .gacha-overlay.animating.high-tier .gacha-sparkles span {
          animation: sparkleDrift 1.05s ease-in-out infinite !important;
        }
        .gacha-overlay.animating.high-tier .gacha-picked-card {
          filter: drop-shadow(0 0 28px color-mix(in srgb, var(--special-tier-a) 44%, transparent)) !important;
        }

        .gacha-overlay.revealed.tier-diamond .gacha-card-face.front::after,
        .gacha-overlay.revealed.tier-master .gacha-card-face.front::after,
        .gacha-overlay.revealed.tier-grandmaster .gacha-card-face.front::after,
        .gacha-overlay.revealed.tier-challenger .gacha-card-face.front::after {
          opacity: 0.34 !important;
          animation: highTierFrontSparkle 4.8s linear infinite !important;
          filter: blur(1px);
        }
        .gacha-overlay.revealed.tier-diamond .gacha-card-face.front {
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), 0 38px 98px rgba(0,0,0,0.82), 0 0 92px rgba(56,189,248,0.34) !important;
        }
        .gacha-overlay.revealed.tier-master .gacha-card-face.front {
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), 0 38px 98px rgba(0,0,0,0.82), 0 0 92px rgba(192,132,252,0.34) !important;
        }
        .gacha-overlay.revealed.tier-grandmaster .gacha-card-face.front {
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), 0 38px 98px rgba(0,0,0,0.82), 0 0 92px rgba(239,68,68,0.34) !important;
        }
        .gacha-overlay.revealed.tier-challenger .gacha-card-face.front {
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16), 0 38px 98px rgba(0,0,0,0.82), 0 0 98px rgba(250,204,21,0.36) !important;
        }
        .gacha-overlay.revealed.tier-diamond .gacha-card-face.front .auction-front-stat,
        .gacha-overlay.revealed.tier-master .gacha-card-face.front .auction-front-stat,
        .gacha-overlay.revealed.tier-grandmaster .gacha-card-face.front .auction-front-stat,
        .gacha-overlay.revealed.tier-challenger .gacha-card-face.front .auction-front-stat {
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 34px rgba(0,0,0,0.34), 0 0 18px color-mix(in srgb, var(--special-tier-a) 16%, transparent) !important;
        }

        @keyframes highTierPremonition {
          0% { opacity: 0; transform: scale(.72); }
          24% { opacity: .28; }
          52% { opacity: .52; transform: scale(1.02); }
          100% { opacity: 0; transform: scale(1.16); }
        }
        @keyframes highTierSuspenseVeil {
          0% { opacity: 0; transform: scale(1); }
          18% { opacity: .16; }
          50% { opacity: .34; transform: scale(1.02); }
          100% { opacity: 0; transform: scale(1.04); }
        }
        @keyframes highTierSelectionPulse {
          0% { opacity: 0; transform: scale(.76); box-shadow: 0 0 0 0 color-mix(in srgb, var(--special-tier-b) 0%, transparent); }
          38% { opacity: .82; }
          72% { opacity: .52; box-shadow: 0 0 42px 10px color-mix(in srgb, var(--special-tier-b) 32%, transparent); }
          100% { opacity: 0; transform: scale(1.18); box-shadow: 0 0 62px 22px color-mix(in srgb, var(--special-tier-b) 0%, transparent); }
        }
        @keyframes highTierCrownSpin {
          0% { opacity: 0; transform: rotate(0deg) scale(.84); }
          20% { opacity: .42; }
          65% { opacity: .56; }
          100% { opacity: 0; transform: rotate(130deg) scale(1.16); }
        }
        @keyframes highTierRingFlare {
          0% { box-shadow: inset 0 0 80px rgba(59,130,246,0.14), 0 0 44px rgba(59,130,246,0.20); }
          45% { box-shadow: inset 0 0 140px color-mix(in srgb, var(--special-tier-a) 22%, transparent), 0 0 96px color-mix(in srgb, var(--special-tier-b) 34%, transparent); }
          100% { box-shadow: inset 0 0 100px color-mix(in srgb, var(--special-tier-a) 10%, transparent), 0 0 60px color-mix(in srgb, var(--special-tier-b) 18%, transparent); }
        }
        @keyframes highTierBurst {
          0% { opacity: .28; transform: scale(.72); }
          32% { opacity: 1; transform: scale(1.16); }
          100% { opacity: .22; transform: scale(1.6); }
        }
        @keyframes highTierFrontSparkle {
          0% { transform: rotate(0deg); opacity: .18; }
          25% { opacity: .34; }
          50% { opacity: .20; }
          75% { opacity: .32; }
          100% { transform: rotate(360deg); opacity: .18; }
        }

        /* K-LOL.GG staged reveal + card-foley sound patch */
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          opacity: 1 !important;
          animation: none !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
        }
        .gacha-overlay.phase-flipping .gacha-card-inner,
        .gacha-overlay.revealed .gacha-card-inner {
          transform: rotateY(180deg);
        }
        .gacha-overlay.phase-flipping.high-tier .gacha-card-inner {
          transition-duration: 2.35s;
        }
        .gacha-overlay.phase-flipping.master-plus .gacha-card-inner {
          transition-duration: 2.8s;
        }
        .gacha-overlay.phase-tier_ascending.gold-below .gacha-light-burst {
          animation: lowTierColorPulse 0.78s ease-out both;
        }
        .gacha-overlay.phase-tier_ascending.gold-below .gacha-ring {
          animation: ringFloat 5.2s ease-in-out infinite, lowTierRingPulse 0.78s ease-out both !important;
        }
        .gacha-overlay.phase-tier_ascending.standard-tier .gacha-light-burst {
          animation: standardTierColorPulse 1.08s ease-out both;
        }
        .gacha-overlay.phase-tier_ascending.diamond-plus .gacha-showcase {
          animation: diamondTierBackgroundAscend 2.6s steps(1, end) both;
        }
        .gacha-overlay.phase-tier_ascending.diamond-plus .gacha-light-burst {
          animation: diamondTierBurstAscend 2.6s ease-in-out both;
        }
        .gacha-overlay.phase-tier_ascending.diamond-plus .gacha-ring {
          animation: ringFloat 3.6s ease-in-out infinite, diamondTierRingAscend 2.6s ease-in-out both !important;
        }
        .gacha-overlay.phase-tier_ascending.master-plus .gacha-showcase {
          animation: masterTierBackgroundAscend 3.2s steps(1, end) both;
        }
        .gacha-overlay.phase-tier_ascending.master-plus .gacha-light-burst {
          animation: masterTierBurstAscend 3.2s ease-in-out both;
        }
        .gacha-overlay.phase-tier_ascending.master-plus .gacha-ring {
          animation: ringFloat 3.2s ease-in-out infinite, masterTierRingAscend 3.2s ease-in-out both !important;
        }
        .gacha-overlay.phase-special_tension.master-plus .gacha-showcase::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--special-tier-a) 22%, transparent), transparent 32%),
            conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--special-tier-b) 20%, transparent) 70deg, transparent 130deg, color-mix(in srgb, var(--special-tier-a) 18%, transparent) 220deg, transparent 300deg);
          filter: blur(10px);
          opacity: 0;
          animation: masterTensionAura 1.55s ease-in-out both;
        }
        .gacha-overlay.phase-special_tension.master-plus .gacha-light-burst {
          animation: masterTensionBurst 1.55s ease-in-out both;
        }
        .gacha-overlay.phase-special_tension.master-plus .gacha-picked-shell::before {
          content: "";
          position: absolute;
          inset: -16%;
          border-radius: 40px;
          border: 2px solid color-mix(in srgb, var(--special-tier-a) 55%, rgba(255,255,255,0.18));
          box-shadow: 0 0 56px color-mix(in srgb, var(--special-tier-b) 42%, transparent);
          pointer-events: none;
          animation: masterCardWarning 1.55s ease-in-out both;
        }

        @keyframes lowTierColorPulse {
          0% { opacity: .35; transform: scale(.88); }
          45% { opacity: .9; transform: scale(1.08); }
          100% { opacity: .42; transform: scale(.98); }
        }
        @keyframes lowTierRingPulse {
          0% { box-shadow: inset 0 0 70px rgba(59,130,246,0.12), 0 0 30px rgba(59,130,246,0.16); }
          50% { box-shadow: inset 0 0 100px color-mix(in srgb, var(--card-tier-glow) 22%, transparent), 0 0 58px color-mix(in srgb, var(--card-tier-glow) 32%, transparent); }
          100% { box-shadow: inset 0 0 70px rgba(59,130,246,0.12), 0 0 30px rgba(59,130,246,0.16); }
        }
        @keyframes standardTierColorPulse {
          0% { opacity: .36; transform: scale(.86); }
          40% { opacity: .82; transform: scale(1.10); }
          72% { opacity: .58; transform: scale(.98); }
          100% { opacity: .42; transform: scale(1.02); }
        }
        @keyframes diamondTierBackgroundAscend {
          0% { background: radial-gradient(circle at 50% 46%, rgba(203,213,225,.18), transparent 42%), linear-gradient(180deg, #071529 0%, #050c1b 100%); }
          22% { background: radial-gradient(circle at 50% 46%, rgba(251,191,36,.22), transparent 42%), linear-gradient(180deg, #14100a 0%, #050c1b 100%); }
          44% { background: radial-gradient(circle at 50% 46%, rgba(45,212,191,.24), transparent 42%), linear-gradient(180deg, #061a1d 0%, #050c1b 100%); }
          66% { background: radial-gradient(circle at 50% 46%, rgba(16,185,129,.24), transparent 42%), linear-gradient(180deg, #061a13 0%, #050c1b 100%); }
          100% { background: radial-gradient(circle at 50% 46%, rgba(56,189,248,.32), transparent 42%), linear-gradient(180deg, #071529 0%, #050c1b 100%); }
        }
        @keyframes diamondTierBurstAscend {
          0% { opacity: .22; transform: scale(.8); }
          22% { opacity: .42; transform: scale(.92); }
          44% { opacity: .58; transform: scale(1.02); }
          66% { opacity: .72; transform: scale(1.12); }
          100% { opacity: .9; transform: scale(1.24); }
        }
        @keyframes diamondTierRingAscend {
          0% { border-color: rgba(203,213,225,.35); }
          22% { border-color: rgba(251,191,36,.45); }
          44% { border-color: rgba(45,212,191,.50); }
          66% { border-color: rgba(16,185,129,.56); }
          100% { border-color: rgba(56,189,248,.76); }
        }
        @keyframes masterTierBackgroundAscend {
          0% { background: radial-gradient(circle at 50% 46%, rgba(203,213,225,.16), transparent 42%), linear-gradient(180deg, #071529 0%, #050c1b 100%); }
          14% { background: radial-gradient(circle at 50% 46%, rgba(251,191,36,.20), transparent 42%), linear-gradient(180deg, #14100a 0%, #050c1b 100%); }
          28% { background: radial-gradient(circle at 50% 46%, rgba(45,212,191,.22), transparent 42%), linear-gradient(180deg, #061a1d 0%, #050c1b 100%); }
          42% { background: radial-gradient(circle at 50% 46%, rgba(16,185,129,.24), transparent 42%), linear-gradient(180deg, #061a13 0%, #050c1b 100%); }
          56% { background: radial-gradient(circle at 50% 46%, rgba(56,189,248,.30), transparent 42%), linear-gradient(180deg, #071529 0%, #050c1b 100%); }
          74% { background: radial-gradient(circle at 50% 46%, color-mix(in srgb, var(--special-tier-b) 26%, transparent), transparent 42%), linear-gradient(180deg, color-mix(in srgb, var(--front-top) 52%, #071529) 0%, #050c1b 100%); }
          100% { background: radial-gradient(circle at 50% 46%, color-mix(in srgb, var(--special-tier-a) 32%, transparent), transparent 42%), linear-gradient(180deg, color-mix(in srgb, var(--front-top) 64%, #071529) 0%, #050c1b 100%); }
        }
        @keyframes masterTierBurstAscend {
          0% { opacity: .22; transform: scale(.78); }
          36% { opacity: .56; transform: scale(1.02); }
          64% { opacity: .82; transform: scale(1.2); }
          100% { opacity: .98; transform: scale(1.38); }
        }
        @keyframes masterTierRingAscend {
          0% { border-color: rgba(203,213,225,.32); box-shadow: inset 0 0 72px rgba(203,213,225,.08), 0 0 32px rgba(203,213,225,.10); }
          56% { border-color: rgba(56,189,248,.72); box-shadow: inset 0 0 100px rgba(56,189,248,.16), 0 0 64px rgba(56,189,248,.22); }
          100% { border-color: color-mix(in srgb, var(--special-tier-a) 72%, rgba(255,255,255,.18)); box-shadow: inset 0 0 138px color-mix(in srgb, var(--special-tier-a) 24%, transparent), 0 0 92px color-mix(in srgb, var(--special-tier-b) 34%, transparent); }
        }
        @keyframes masterTensionAura {
          0% { opacity: 0; transform: scale(.82) rotate(0deg); }
          42% { opacity: .68; transform: scale(1.02) rotate(28deg); }
          100% { opacity: .18; transform: scale(1.2) rotate(88deg); }
        }
        @keyframes masterTensionBurst {
          0% { opacity: .36; transform: scale(.96); }
          42% { opacity: 1; transform: scale(1.3); }
          100% { opacity: .48; transform: scale(1.55); }
        }
        @keyframes masterCardWarning {
          0% { opacity: 0; transform: scale(.86); }
          38% { opacity: .88; transform: scale(1.02); }
          100% { opacity: .18; transform: scale(1.22); }
        }


        
        /* K-LOL.GG tier criteria rework: gold-below / diamond-plus / master-plus */
        .gacha-overlay.gold-below .gacha-deck-cluster { animation-duration: 4.05s !important; }
        .gacha-overlay.gold-below .gacha-card-back { animation-duration: 1.25s, 1.25s !important; animation-delay: var(--d), calc(1.22s + var(--d)) !important; }
        .gacha-overlay.gold-below .gacha-picked-card { animation: selectedLineCardGoldBelow 4.05s cubic-bezier(.2,.86,.18,1) forwards !important; }
        .gacha-overlay.gold-below .gacha-card-inner { transition-duration: 1.18s !important; }
        .gacha-overlay.gold-below .gacha-showcase::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 50% 52%, color-mix(in srgb, var(--card-tier-glow) 28%, transparent), transparent 48%); opacity: 0; pointer-events: none; animation: goldBelowColorPulse 1.05s ease-out 2.05s both; }

        .gacha-overlay.diamond-plus .gacha-deck-cluster { animation-duration: 6.8s !important; }
        .gacha-overlay.diamond-plus .gacha-picked-card { animation: selectedLineCardDiamondPlus 6.8s cubic-bezier(.16,.92,.18,1) forwards !important; }
        .gacha-overlay.diamond-plus .gacha-card-inner { transition-duration: 2.72s !important; }
        .gacha-overlay.diamond-plus .gacha-showcase::before, .gacha-overlay.diamond-plus .gacha-showcase::after, .gacha-overlay.master-plus .gacha-showcase::before, .gacha-overlay.master-plus .gacha-showcase::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1; }
        .gacha-overlay.diamond-plus .gacha-showcase::before, .gacha-overlay.master-plus .gacha-showcase::before { background: radial-gradient(circle at 50% 52%, rgba(226,232,240,0.18), transparent 42%); opacity: 0; animation: tierAscentDiamond 3.35s ease-in-out 2.28s both; }
        .gacha-overlay.diamond-plus .gacha-showcase::after, .gacha-overlay.master-plus .gacha-showcase::after { background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--special-tier-c) 12%, transparent) 48%, transparent 100%); opacity: 0; animation: diamondSuspenseSweep 2.3s ease-in-out 3.05s both; }
        .gacha-overlay.diamond-plus .gacha-picked-shell::before, .gacha-overlay.master-plus .gacha-picked-shell::before { content: ""; position: absolute; inset: -8%; border-radius: 34px; border: 2px solid color-mix(in srgb, var(--special-tier-a) 50%, rgba(255,255,255,0.18)); opacity: 0; pointer-events: none; animation: diamondSelectionPulse 1.5s ease-out 3.8s both; }

        .gacha-overlay.master-plus .gacha-deck-cluster { animation-duration: 7.7s !important; }
        .gacha-overlay.master-plus .gacha-picked-card { animation: selectedLineCardMasterPlus 7.7s cubic-bezier(.14,.9,.16,1) forwards !important; filter: drop-shadow(0 0 34px color-mix(in srgb, var(--special-tier-a) 54%, transparent)) !important; }
        .gacha-overlay.master-plus .gacha-card-inner { transition-duration: 3.25s !important; }
        .gacha-overlay.master-plus .gacha-showcase::before { animation-name: tierAscentMaster; animation-duration: 4.35s; animation-delay: 2.15s; }
        .gacha-overlay.master-plus.tier-grandmaster .gacha-showcase::before { animation-name: tierAscentGrandmaster; }
        .gacha-overlay.master-plus.tier-challenger .gacha-showcase::before { animation-name: tierAscentChallenger; }
        .gacha-overlay.master-plus .gacha-showcase::after { animation: masterSuspenseSweep 3.2s ease-in-out 3.05s both; }
        .gacha-overlay.master-plus .gacha-picked-shell::before { animation: masterSelectionPulse 2.2s cubic-bezier(.2,.86,.18,1) 3.55s both; }
        .gacha-overlay.master-plus .gacha-picked-shell::after { content: ""; position: absolute; inset: -24%; border-radius: 999px; background: conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--special-tier-a) 20%, transparent) 48deg, transparent 108deg, color-mix(in srgb, var(--special-tier-b) 18%, transparent) 202deg, transparent 268deg, color-mix(in srgb, var(--special-tier-a) 24%, transparent) 330deg, transparent 360deg); filter: blur(3px); opacity: 0; pointer-events: none; animation: masterCrownSpin 3.1s linear 3.95s both; }
        .gacha-overlay.master-plus .gacha-light-burst { animation: masterLightCharge 2.4s ease-in-out 3.35s both; }
        .gacha-overlay.master-plus .gacha-ring { animation: ringFloat 3.4s ease-in-out infinite, masterRingFlare 2.4s ease-in-out 3.2s both !important; }
        .gacha-overlay.revealed.master-plus .gacha-card-face.front::after { opacity: 0.42 !important; animation: masterFrontSparkle 3.8s linear infinite !important; }
        .gacha-overlay.revealed.master-plus .gacha-card-face.front::before { background-image: radial-gradient(circle at 50% 14%, color-mix(in srgb, var(--special-tier-a) 18%, transparent), transparent 30%), radial-gradient(circle at 74% 12%, color-mix(in srgb, var(--card-tier-glow) 38%, transparent), transparent 26%), linear-gradient(135deg, rgba(255,255,255,0.12), transparent 26%), repeating-linear-gradient(135deg, rgba(255,255,255,0.032) 0 8px, transparent 8px 18px) !important; }

        @keyframes selectedLineCardGoldBelow { 0% { opacity: 0; transform: translate3d(0, 132px, 0) scale(.28) rotate(0deg); } 32% { opacity: 1; transform: translate3d(0, 76px, 0) scale(.52) rotate(-4deg); } 52% { opacity: 1; transform: translate3d(0, 4px, 0) scale(.82) rotate(3deg); } 70% { opacity: 1; transform: translate3d(0, -26px, 0) scale(1.02) rotate(-2deg); } 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes goldBelowColorPulse { 0% { opacity: 0; transform: scale(.92); } 34% { opacity: .34; transform: scale(1.05); } 72% { opacity: .18; transform: scale(1.12); } 100% { opacity: 0; transform: scale(1.2); } }
        @keyframes selectedLineCardDiamondPlus { 0% { opacity: 0; transform: translate3d(0, 152px, 0) scale(.24) rotate(0deg); } 34% { opacity: 0; transform: translate3d(0, 152px, 0) scale(.24) rotate(0deg); } 48% { opacity: 1; transform: translate3d(0, 92px, 0) scale(.52) rotate(-5deg); } 64% { opacity: 1; transform: translate3d(0, -8px, 0) scale(.82) rotate(4deg); } 80% { opacity: 1; transform: translate3d(0, -72px, 0) scale(1.05) rotate(-2deg); } 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes selectedLineCardMasterPlus { 0% { opacity: 0; transform: translate3d(0, 164px, 0) scale(.22) rotate(0deg); } 38% { opacity: 0; transform: translate3d(0, 164px, 0) scale(.22) rotate(0deg); } 50% { opacity: 1; transform: translate3d(0, 112px, 0) scale(.46) rotate(-5deg); } 66% { opacity: 1; transform: translate3d(0, 8px, 0) scale(.78) rotate(5deg); } 82% { opacity: 1; transform: translate3d(0, -86px, 0) scale(1.09) rotate(-3deg); } 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes tierAscentDiamond { 0% { opacity: 0; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.18), transparent 42%); } 18% { opacity: .22; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.22), transparent 44%); } 36% { opacity: .30; background: radial-gradient(circle at 50% 52%, rgba(250,204,21,.22), transparent 45%); } 54% { opacity: .36; background: radial-gradient(circle at 50% 52%, rgba(45,212,191,.22), transparent 46%); } 72% { opacity: .44; background: radial-gradient(circle at 50% 52%, rgba(16,185,129,.25), transparent 48%); } 88% { opacity: .50; background: radial-gradient(circle at 50% 52%, rgba(56,189,248,.38), transparent 52%); } 100% { opacity: .16; background: radial-gradient(circle at 50% 52%, rgba(56,189,248,.20), transparent 56%); } }
        @keyframes tierAscentMaster { 0% { opacity: 0; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.18), transparent 42%); } 16% { opacity: .20; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.22), transparent 44%); } 32% { opacity: .28; background: radial-gradient(circle at 50% 52%, rgba(250,204,21,.22), transparent 45%); } 48% { opacity: .34; background: radial-gradient(circle at 50% 52%, rgba(45,212,191,.22), transparent 46%); } 62% { opacity: .40; background: radial-gradient(circle at 50% 52%, rgba(16,185,129,.25), transparent 48%); } 76% { opacity: .48; background: radial-gradient(circle at 50% 52%, rgba(56,189,248,.34), transparent 51%); } 90% { opacity: .58; background: radial-gradient(circle at 50% 52%, rgba(192,132,252,.45), transparent 54%); } 100% { opacity: .20; background: radial-gradient(circle at 50% 52%, rgba(192,132,252,.22), transparent 58%); } }
        @keyframes tierAscentGrandmaster { 0% { opacity: 0; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.18), transparent 42%); } 14% { opacity: .20; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.22), transparent 44%); } 28% { opacity: .28; background: radial-gradient(circle at 50% 52%, rgba(250,204,21,.22), transparent 45%); } 42% { opacity: .34; background: radial-gradient(circle at 50% 52%, rgba(45,212,191,.22), transparent 46%); } 56% { opacity: .40; background: radial-gradient(circle at 50% 52%, rgba(16,185,129,.25), transparent 48%); } 70% { opacity: .48; background: radial-gradient(circle at 50% 52%, rgba(56,189,248,.34), transparent 51%); } 84% { opacity: .58; background: radial-gradient(circle at 50% 52%, rgba(192,132,252,.40), transparent 54%); } 94% { opacity: .68; background: radial-gradient(circle at 50% 52%, rgba(239,68,68,.46), transparent 56%); } 100% { opacity: .22; background: radial-gradient(circle at 50% 52%, rgba(239,68,68,.22), transparent 60%); } }
        @keyframes tierAscentChallenger { 0% { opacity: 0; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.18), transparent 42%); } 12% { opacity: .20; background: radial-gradient(circle at 50% 52%, rgba(226,232,240,.22), transparent 44%); } 24% { opacity: .28; background: radial-gradient(circle at 50% 52%, rgba(250,204,21,.22), transparent 45%); } 36% { opacity: .34; background: radial-gradient(circle at 50% 52%, rgba(45,212,191,.22), transparent 46%); } 48% { opacity: .40; background: radial-gradient(circle at 50% 52%, rgba(16,185,129,.25), transparent 48%); } 60% { opacity: .48; background: radial-gradient(circle at 50% 52%, rgba(56,189,248,.34), transparent 51%); } 72% { opacity: .58; background: radial-gradient(circle at 50% 52%, rgba(192,132,252,.40), transparent 54%); } 84% { opacity: .68; background: radial-gradient(circle at 50% 52%, rgba(239,68,68,.42), transparent 56%); } 94% { opacity: .78; background: radial-gradient(circle at 50% 52%, rgba(250,204,21,.52), transparent 58%); } 100% { opacity: .26; background: radial-gradient(circle at 50% 52%, rgba(250,204,21,.28), transparent 62%); } }
        @keyframes diamondSuspenseSweep { 0% { opacity: 0; transform: translateX(-18%); } 42% { opacity: .24; } 100% { opacity: 0; transform: translateX(18%); } }
        @keyframes masterSuspenseSweep { 0% { opacity: 0; transform: translateX(-20%) scale(.98); } 35% { opacity: .34; } 68% { opacity: .22; } 100% { opacity: 0; transform: translateX(20%) scale(1.04); } }
        @keyframes diamondSelectionPulse { 0% { opacity: 0; transform: scale(.78); } 38% { opacity: .70; } 100% { opacity: 0; transform: scale(1.14); } }
        @keyframes masterSelectionPulse { 0% { opacity: 0; transform: scale(.74); box-shadow: 0 0 0 0 color-mix(in srgb, var(--special-tier-b) 0%, transparent); } 36% { opacity: .86; } 68% { opacity: .58; box-shadow: 0 0 52px 12px color-mix(in srgb, var(--special-tier-b) 34%, transparent); } 100% { opacity: 0; transform: scale(1.2); box-shadow: 0 0 74px 24px transparent; } }
        @keyframes masterCrownSpin { 0% { opacity: 0; transform: rotate(0deg) scale(.82); } 18% { opacity: .46; } 66% { opacity: .60; } 100% { opacity: 0; transform: rotate(170deg) scale(1.18); } }
        @keyframes masterLightCharge { 0% { opacity: .24; transform: scale(.78); } 32% { opacity: 1; transform: scale(1.16); } 70% { opacity: .52; transform: scale(1.38); } 100% { opacity: .24; transform: scale(1.64); } }
        @keyframes masterRingFlare { 0% { box-shadow: inset 0 0 80px rgba(59,130,246,0.14), 0 0 44px rgba(59,130,246,0.20); } 45% { box-shadow: inset 0 0 150px color-mix(in srgb, var(--special-tier-a) 24%, transparent), 0 0 104px color-mix(in srgb, var(--special-tier-b) 38%, transparent); } 100% { box-shadow: inset 0 0 104px color-mix(in srgb, var(--special-tier-a) 12%, transparent), 0 0 66px color-mix(in srgb, var(--special-tier-b) 20%, transparent); } }
        @keyframes masterFrontSparkle { 0% { transform: rotate(0deg); opacity: .22; } 25% { opacity: .44; } 50% { opacity: .24; } 75% { opacity: .40; } 100% { transform: rotate(360deg); opacity: .22; } }


                .auction-fullview-overlay { position: fixed; inset: 0; z-index: 2147483647; background: #020817; display: block; overflow: auto; padding: 28px; }
        .auction-fullview-panel { width: min(1380px, calc(100vw - 56px)); min-height: calc(100vh - 56px); margin: 0 auto; border-radius: 28px; border: 1px solid rgba(96,165,250,0.32); background: linear-gradient(180deg, rgba(9,22,47,0.98), rgba(5,12,27,0.98)); box-shadow: 0 30px 100px rgba(0,0,0,0.68); padding: 28px; }
        .auction-fullview-close { position: fixed; top: 24px; right: 28px; z-index: 3; width: 48px; height: 48px; border-radius: 16px; border: 1px solid rgba(125,211,252,0.28); background: linear-gradient(135deg, rgba(37,99,235,0.95), rgba(14,165,233,0.92)); color: #fff; font-size: 24px; font-weight: 900; box-shadow: 0 18px 42px rgba(14,165,233,0.20); }
        .auction-fullview-header { margin-bottom: 22px; }
        .auction-fullview-title { font-size: 28px; font-weight: 900; color: #f8fbff; margin: 0 0 8px; }
        .auction-fullview-desc { margin: 0; color: #9fb8d8; line-height: 1.55; }
        .auction-fullview-panel .destruction-auction-summary { margin-bottom: 18px; }
        .auction-fullview-panel .destruction-auction-layout { grid-template-columns: minmax(620px, 1.4fr) minmax(420px, 0.85fr); }
        .auction-fullview-panel .destruction-team-matrix-grid { min-width: 0; }
        @media (max-width: 700px) {
          .auction-card-action-grid { grid-template-columns: 1fr; }
          .auction-fullview-overlay { padding: 12px; }
          .auction-fullview-panel { width: calc(100vw - 24px); min-height: calc(100vh - 24px); padding: 18px; }
          .auction-fullview-panel .destruction-auction-layout { grid-template-columns: 1fr; }
        }

        @keyframes auctionMiniSweep { from { transform: translateX(-40%); } to { transform: translateX(40%); } }
        @keyframes ringFloat { 0%,100% { transform: scale(0.985); opacity: 0.85; } 50% { transform: scale(1.03); opacity: 1; } }
        @keyframes speedMoveA { from { transform: translate3d(-28px, 0, 0); opacity: 0.2; } to { transform: translate3d(66px, 0, 0); opacity: 0.58; } }
        @keyframes speedMoveB { from { transform: translate3d(46px, 0, 0); opacity: 0.12; } to { transform: translate3d(-70px, 0, 0); opacity: 0.52; } }
        @keyframes sparkleDrift { 0% { opacity: 0; transform: translateY(10px) scale(0.8); } 35% { opacity: 1; transform: translateY(-10px) scale(1); } 100% { opacity: 0; transform: translateY(-34px) scale(0.7); } }
        @keyframes shockwave { 0% { transform: scale(0.6); opacity: 0.68; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes lineDeckSweep { 0% { transform: translateY(22px) scale(.96); filter: brightness(.78); } 18% { transform: translateY(18px) scale(1); filter: brightness(1.02); } 44% { transform: translateY(6px) scale(1.02); filter: brightness(1.12); } 72% { transform: translateY(10px) scale(1); filter: brightness(1.04); } 100% { transform: translateY(28px) scale(.9); filter: brightness(.72); } }
        @keyframes lineFanOut { 0% { opacity: 0; transform: translate(-440px, 92px) rotate(-24deg) scale(.46); } 42% { opacity: 1; transform: translate(calc(var(--x) * .52), 34px) rotate(calc(var(--r) * .42)) scale(.68); } 76% { opacity: .96; transform: translate(var(--x), 6px) rotate(var(--r)) scale(.82); } 100% { opacity: .82; transform: translate(var(--x), 18px) rotate(var(--r)) scale(.76); } }
        @keyframes lineCardBreath { 0%,100% { filter: brightness(.9); } 50% { filter: brightness(1.22); } }
        @keyframes lineCardBreathHigh { 0%,100% { filter: brightness(.96) drop-shadow(0 0 2px var(--tier-glow)); } 50% { filter: brightness(1.42) drop-shadow(0 0 16px var(--tier-glow)); } }
        @keyframes selectedLineCard { 0% { opacity: 0; transform: translate3d(0, 132px, 0) scale(.32) rotate(0deg); } 26% { opacity: 0; transform: translate3d(0, 132px, 0) scale(.32) rotate(0deg); } 40% { opacity: 1; transform: translate3d(0, 96px, 0) scale(.48) rotate(0deg); } 55% { opacity: 1; transform: translate3d(0, 26px, 0) scale(.7) rotate(-5deg); } 70% { opacity: 1; transform: translate3d(0, -52px, 0) scale(.92) rotate(4deg); } 84% { opacity: 1; transform: translate3d(0, -76px, 0) scale(1.04) rotate(-2deg); } 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes selectedLineCardHigh { 0% { opacity: 0; transform: translate3d(0, 142px, 0) scale(.28) rotate(0deg); } 30% { opacity: 0; transform: translate3d(0, 142px, 0) scale(.28) rotate(0deg); } 43% { opacity: 1; transform: translate3d(0, 108px, 0) scale(.46) rotate(0deg); } 58% { opacity: 1; transform: translate3d(0, 22px, 0) scale(.72) rotate(-7deg); } 74% { opacity: 1; transform: translate3d(0, -64px, 0) scale(.96) rotate(6deg); } 88% { opacity: 1; transform: translate3d(0, -84px, 0) scale(1.07) rotate(-3deg); } 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes flipFlash { 0% { opacity: 0; transform: scale(0.76); } 36% { opacity: 1; transform: scale(1.08); } 100% { opacity: 0; transform: scale(1.26); } }
        @keyframes highTierAura { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }


        /* K-LOL.GG final grouped auction flow: gold-below / ascent-tier / master-plus */
        .gacha-overlay.gold-below .gacha-deck-cluster { animation-duration: 3.15s !important; }
        .gacha-overlay.gold-below .gacha-card-back { animation-duration: 1.08s, 1.2s !important; animation-delay: var(--d), calc(1.04s + var(--d)) !important; }
        .gacha-overlay.ascent-tier .gacha-deck-cluster { animation-duration: 4.9s !important; }
        .gacha-overlay.master-plus .gacha-deck-cluster { animation-duration: 6.35s !important; }

        .gacha-overlay.phase-shuffling .gacha-picked-card { opacity: 0 !important; transform: translate3d(0, 140px, 0) scale(.26) rotate(0deg) !important; animation: none !important; }
        .gacha-overlay.phase-selecting .gacha-picked-card { opacity: 1 !important; animation: pickedSelectPop .46s cubic-bezier(.18,.92,.18,1) both !important; }
        .gacha-overlay.phase-approaching.gold-below .gacha-picked-card { opacity: 1 !important; animation: pickedApproachShort .48s cubic-bezier(.2,.86,.18,1) both !important; }
        .gacha-overlay.phase-approaching.ascent-tier .gacha-picked-card { opacity: 1 !important; animation: pickedApproachMid .72s cubic-bezier(.18,.88,.18,1) both !important; }
        .gacha-overlay.phase-approaching.master-plus .gacha-picked-card { opacity: 1 !important; animation: pickedApproachMaster .9s cubic-bezier(.14,.9,.16,1) both !important; }
        .gacha-overlay.phase-tier_ascending .gacha-picked-card { opacity: 1 !important; animation: pickedTierHold 1.2s ease-in-out infinite alternate !important; }
        .gacha-overlay.phase-tier_ascending.gold-below .gacha-picked-card { animation: pickedGoldPulse .72s ease-out both !important; }
        .gacha-overlay.phase-special_tension.master-plus .gacha-picked-card { opacity: 1 !important; animation: pickedMasterTension 1.6s cubic-bezier(.2,.82,.18,1) infinite alternate !important; }
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card { opacity: 1 !important; transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important; animation: none !important; }
        .gacha-overlay.phase-approaching .gacha-deck-cluster,
        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster { opacity: 0 !important; transform: translateY(80px) scale(.76) !important; transition: opacity .38s ease, transform .38s ease !important; }

        .gacha-overlay.ascent-1 { --current-stage-color: #6b7280; --current-stage-glow: rgba(107,114,128,.30); }
        .gacha-overlay.ascent-2 { --current-stage-color: #b45309; --current-stage-glow: rgba(180,83,9,.34); }
        .gacha-overlay.ascent-3 { --current-stage-color: #cbd5e1; --current-stage-glow: rgba(203,213,225,.34); }
        .gacha-overlay.ascent-4 { --current-stage-color: #fbbf24; --current-stage-glow: rgba(251,191,36,.38); }
        .gacha-overlay.ascent-5 { --current-stage-color: #2dd4bf; --current-stage-glow: rgba(45,212,191,.42); }
        .gacha-overlay.ascent-6 { --current-stage-color: #10b981; --current-stage-glow: rgba(16,185,129,.45); }
        .gacha-overlay.ascent-7 { --current-stage-color: #38bdf8; --current-stage-glow: rgba(56,189,248,.50); }
        .gacha-overlay.ascent-8 { --current-stage-color: #c084fc; --current-stage-glow: rgba(192,132,252,.54); }
        .gacha-overlay.ascent-9 { --current-stage-color: #ef4444; --current-stage-glow: rgba(239,68,68,.56); }
        .gacha-overlay.ascent-10 { --current-stage-color: #facc15; --current-stage-glow: rgba(250,204,21,.58); }

        .gacha-overlay.phase-tier_ascending .gacha-showcase,
        .gacha-overlay.phase-special_tension .gacha-showcase {
          background:
            radial-gradient(circle at 50% 52%, var(--current-stage-glow, var(--card-tier-glow)), transparent 44%),
            radial-gradient(circle at 50% 52%, color-mix(in srgb, var(--current-stage-color, var(--card-tier-primary)) 18%, transparent), transparent 60%),
            linear-gradient(180deg, #071529 0%, #050c1b 100%) !important;
        }
        .gacha-overlay.phase-tier_ascending .gacha-ring {
          border-color: color-mix(in srgb, var(--current-stage-color, var(--card-tier-primary)) 62%, rgba(255,255,255,.2)) !important;
          box-shadow: inset 0 0 92px var(--current-stage-glow, var(--card-tier-glow)), 0 0 62px var(--current-stage-glow, var(--card-tier-glow)) !important;
        }
        .gacha-overlay.phase-tier_ascending .gacha-light-burst {
          background: radial-gradient(circle, var(--current-stage-glow, var(--card-tier-glow)) 0%, transparent 68%) !important;
          opacity: .72 !important;
          transform: scale(1.05) !important;
        }
        .gacha-overlay.phase-tier_ascending.gold-below .gacha-light-burst { animation: finalGoldPulse .72s ease-out both !important; }

        .gacha-overlay.phase-special_tension.master-plus .gacha-showcase::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background:
            radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--current-stage-color, var(--card-tier-primary)) 28%, transparent), transparent 38%),
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.07), transparent 64%);
          animation: finalMasterPressure 1.55s ease-in-out infinite alternate;
        }
        .gacha-overlay.phase-special_tension.master-plus .gacha-picked-shell::before {
          content: "";
          position: absolute;
          inset: -14%;
          border-radius: 36px;
          border: 2px solid color-mix(in srgb, var(--current-stage-color, var(--card-tier-primary)) 64%, rgba(255,255,255,.18));
          box-shadow: 0 0 56px 10px var(--current-stage-glow, var(--card-tier-glow));
          pointer-events: none;
          animation: finalMasterFrame 1.2s ease-in-out infinite alternate;
        }
        .gacha-overlay.phase-special_tension.tier-master .gacha-picked-shell::after,
        .gacha-overlay.phase-special_tension.tier-grandmaster .gacha-picked-shell::after,
        .gacha-overlay.phase-special_tension.tier-challenger .gacha-picked-shell::after {
          content: "";
          position: absolute;
          inset: -26%;
          border-radius: 999px;
          pointer-events: none;
          opacity: .45;
          filter: blur(2px);
          animation: finalCrownSpin 2.2s linear infinite;
        }
        .gacha-overlay.phase-special_tension.tier-master .gacha-picked-shell::after { background: conic-gradient(from 0deg, transparent, rgba(192,132,252,.34), transparent, rgba(167,139,250,.26), transparent); }
        .gacha-overlay.phase-special_tension.tier-grandmaster .gacha-picked-shell::after { background: conic-gradient(from 0deg, transparent, rgba(239,68,68,.36), transparent, rgba(251,146,60,.24), transparent); }
        .gacha-overlay.phase-special_tension.tier-challenger .gacha-picked-shell::after { background: conic-gradient(from 0deg, transparent, rgba(250,204,21,.42), transparent, rgba(255,255,255,.24), transparent); }

        .gacha-overlay.revealed.ascent-tier .gacha-card-face.front::after { opacity: .20 !important; animation: highTierFrontSparkle 6s linear infinite !important; }
        .gacha-overlay.revealed.master-plus .gacha-card-face.front::after { opacity: .46 !important; animation: masterFrontSparkle 3.5s linear infinite !important; }
        .gacha-overlay.revealed.tier-master .gacha-card-face.front { box-shadow: inset 0 0 0 1px rgba(255,255,255,.14), 0 38px 98px rgba(0,0,0,.82), 0 0 102px rgba(192,132,252,.38) !important; }
        .gacha-overlay.revealed.tier-grandmaster .gacha-card-face.front { box-shadow: inset 0 0 0 1px rgba(255,255,255,.14), 0 38px 98px rgba(0,0,0,.82), 0 0 108px rgba(239,68,68,.40) !important; }
        .gacha-overlay.revealed.tier-challenger .gacha-card-face.front { box-shadow: inset 0 0 0 1px rgba(255,255,255,.16), 0 38px 98px rgba(0,0,0,.82), 0 0 118px rgba(250,204,21,.46) !important; }

        @keyframes pickedSelectPop { 0% { opacity: 0; transform: translate3d(0, 116px, 0) scale(.34) rotate(0deg); } 72% { opacity: 1; transform: translate3d(0, -34px, 0) scale(.9) rotate(-3deg); } 100% { opacity: 1; transform: translate3d(0, -18px, 0) scale(.82) rotate(2deg); } }
        @keyframes pickedApproachShort { 0% { transform: translate3d(0, -18px, 0) scale(.82) rotate(2deg); } 46% { transform: translate3d(0, -42px, 0) scale(1.02) rotate(-1deg); } 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes pickedApproachMid { 0% { transform: translate3d(0, -18px, 0) scale(.82) rotate(2deg); } 38% { transform: translate3d(0, -56px, 0) scale(1.03) rotate(-2deg); } 78% { transform: translate3d(0, -16px, 0) scale(.96) rotate(1deg); } 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes pickedApproachMaster { 0% { transform: translate3d(0, -20px, 0) scale(.8) rotate(2deg); } 34% { transform: translate3d(0, -68px, 0) scale(1.07) rotate(-3deg); } 68% { transform: translate3d(0, -26px, 0) scale(.98) rotate(2deg); } 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); } }
        @keyframes pickedTierHold { from { transform: translate3d(0, 0, 0) scale(1) rotate(-.8deg); filter: drop-shadow(0 0 18px var(--current-stage-glow, var(--card-tier-glow))); } to { transform: translate3d(0, -8px, 0) scale(1.018) rotate(.8deg); filter: drop-shadow(0 0 32px var(--current-stage-glow, var(--card-tier-glow))); } }
        @keyframes pickedGoldPulse { 0% { transform: scale(1); filter: drop-shadow(0 0 12px var(--current-stage-glow, var(--card-tier-glow))); } 44% { transform: scale(1.035); filter: drop-shadow(0 0 34px var(--current-stage-glow, var(--card-tier-glow))); } 100% { transform: scale(1); filter: drop-shadow(0 0 16px var(--current-stage-glow, var(--card-tier-glow))); } }
        @keyframes pickedMasterTension { from { transform: translate3d(0, -4px, 0) scale(1.01); filter: drop-shadow(0 0 32px var(--current-stage-glow, var(--card-tier-glow))); } to { transform: translate3d(0, -16px, 0) scale(1.04); filter: drop-shadow(0 0 60px var(--current-stage-glow, var(--card-tier-glow))); } }
        @keyframes finalGoldPulse { 0% { opacity: .18; transform: scale(.9); } 46% { opacity: .82; transform: scale(1.12); } 100% { opacity: .22; transform: scale(1.26); } }
        @keyframes finalMasterPressure { from { opacity: .20; transform: scale(.96); } to { opacity: .62; transform: scale(1.08); } }
        @keyframes finalMasterFrame { from { opacity: .34; transform: scale(.94); } to { opacity: .78; transform: scale(1.06); } }
        @keyframes finalCrownSpin { from { transform: rotate(0deg) scale(.96); } to { transform: rotate(360deg) scale(1.08); } }


        .gacha-sound-toggle {
          width: fit-content;
          border: 1px solid rgba(96,165,250,.34);
          border-radius: 999px;
          padding: 8px 12px;
          color: #dbeafe;
          background: rgba(15,23,42,.72);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .02em;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(0,0,0,.24);
        }
        .gacha-sound-toggle.is-on { border-color: rgba(125,211,252,.56); color: #ecfeff; }
        .gacha-sound-toggle.is-off { opacity: .72; }

        @media (max-width: 1180px) {
          .destruction-auction-layout { grid-template-columns: 1fr; }
          .destruction-auction-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .gacha-layout { grid-template-columns: 1fr; }
          .gacha-showcase { min-height: 520px; padding: 24px; }
          .gacha-panel { border-left: none; border-top: 1px solid rgba(96,165,250,0.16); padding-top: 28px; min-height: 360px; }
          .gacha-showcase-stage { min-height: 0; }
        }
        @media (max-width: 700px) {
          .destruction-auction-summary { grid-template-columns: 1fr; }
          .auction-front-grid, .gacha-card-stats, .auction-front-actions { grid-template-columns: 1fr; }
          .gacha-overlay { padding: 0; }
          .gacha-overlay-card { width: 100vw; height: 100vh; min-height: 620px; }
          .gacha-layout { height: 100%; }
          .gacha-showcase-stage { min-height: 480px; }
          .gacha-ring { width: 360px; height: 360px; }
          .gacha-picked-shell { width: min(92vw, 320px); height: 440px; }
          .gacha-position-float { position: static; }
          .gacha-position-icon-wrap { width: 72px; height: 72px; }
          .gacha-position-icon { width: 60px; height: 60px; }
          .gacha-tier-icon-wrap { width: 108px; height: 108px; }
          .gacha-tier-image { width: 86px; height: 86px; }
          .gacha-card-stats { grid-template-columns: 1fr; margin-top: 0; }
        }
        /* K-LOL.GG smooth upper-tier flow hotfix: single shuffle, continuous picked-card motion */
        .gacha-overlay:not(.phase-shuffling) .gacha-deck-cluster {
          display: none !important;
          animation: none !important;
          opacity: 0 !important;
        }
        .gacha-overlay:not(.phase-shuffling) .gacha-card-back {
          animation: none !important;
        }
        .gacha-overlay:not(.phase-shuffling):not(.phase-selecting) .gacha-speedlines::before,
        .gacha-overlay:not(.phase-shuffling):not(.phase-selecting) .gacha-speedlines::after {
          animation: none !important;
          opacity: .18 !important;
        }
        .gacha-overlay.phase-shuffling .gacha-picked-card {
          opacity: 0 !important;
          transform: translate3d(0, 118px, 0) scale(.34) rotate(0deg) !important;
          animation: none !important;
        }
        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 1 !important;
          animation: pickedSmoothSelect .52s cubic-bezier(.2,.86,.2,1) both !important;
        }
        .gacha-overlay.phase-approaching .gacha-picked-card {
          opacity: 1 !important;
          animation: pickedSmoothApproach .72s cubic-bezier(.18,.86,.2,1) both !important;
        }
        .gacha-overlay.phase-approaching.master-plus .gacha-picked-card {
          animation-duration: .86s !important;
        }
        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          animation: pickedSmoothTierHold 1.65s ease-in-out infinite alternate !important;
        }
        .gacha-overlay.phase-special_tension.master-plus .gacha-picked-card {
          opacity: 1 !important;
          animation: pickedSmoothSpecialHold 1.95s ease-in-out infinite alternate !important;
        }
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: none !important;
        }
        .gacha-overlay.phase-tier_ascending .gacha-showcase,
        .gacha-overlay.phase-special_tension .gacha-showcase,
        .gacha-overlay.phase-flipping .gacha-showcase {
          transition: background 720ms ease, box-shadow 720ms ease !important;
        }
        .gacha-overlay.phase-tier_ascending .gacha-light-burst,
        .gacha-overlay.phase-special_tension .gacha-light-burst {
          transition: opacity 700ms ease, transform 900ms cubic-bezier(.2,.8,.2,1), background 700ms ease !important;
        }
        .gacha-overlay.phase-tier_ascending.master-plus .gacha-showcase::before,
        .gacha-overlay.phase-special_tension.master-plus .gacha-showcase::before {
          animation: finalMasterPressureSmooth 2.2s ease-in-out infinite alternate !important;
        }
        .gacha-overlay.phase-tier_ascending.master-plus .gacha-picked-shell::before,
        .gacha-overlay.phase-special_tension.master-plus .gacha-picked-shell::before {
          animation: finalMasterFrameSmooth 1.9s ease-in-out infinite alternate !important;
        }
        @keyframes pickedSmoothSelect {
          0% { opacity: 0; transform: translate3d(0, 112px, 0) scale(.36) rotate(0deg); }
          68% { opacity: 1; transform: translate3d(0, -30px, 0) scale(.88) rotate(-2deg); }
          100% { opacity: 1; transform: translate3d(0, -18px, 0) scale(.84) rotate(1deg); }
        }
        @keyframes pickedSmoothApproach {
          0% { opacity: 1; transform: translate3d(0, -18px, 0) scale(.84) rotate(1deg); }
          58% { opacity: 1; transform: translate3d(0, -38px, 0) scale(.98) rotate(-.6deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }
        @keyframes pickedSmoothTierHold {
          0% { transform: translate3d(0, 0, 0) scale(1) rotate(-.35deg); filter: drop-shadow(0 0 18px var(--current-stage-glow, var(--card-tier-glow))); }
          100% { transform: translate3d(0, -5px, 0) scale(1.012) rotate(.35deg); filter: drop-shadow(0 0 30px var(--current-stage-glow, var(--card-tier-glow))); }
        }
        @keyframes pickedSmoothSpecialHold {
          0% { transform: translate3d(0, -2px, 0) scale(1.008); filter: drop-shadow(0 0 30px var(--current-stage-glow, var(--card-tier-glow))); }
          100% { transform: translate3d(0, -10px, 0) scale(1.026); filter: drop-shadow(0 0 52px var(--current-stage-glow, var(--card-tier-glow))); }
        }
        @keyframes finalMasterPressureSmooth {
          0% { opacity: .22; transform: scale(.98); }
          100% { opacity: .42; transform: scale(1.04); }
        }
        @keyframes finalMasterFrameSmooth {
          0% { opacity: .36; transform: scale(.985); }
          100% { opacity: .72; transform: scale(1.025); }
        }


        /* K-LOL.GG final pacing/opacity pass: slow first spread, no transparent artifacts */
        .gacha-overlay.phase-shuffling.gold-below .gacha-deck-cluster { animation-duration: 1.35s !important; }
        .gacha-overlay.phase-shuffling.ascent-tier .gacha-deck-cluster { animation-duration: 1.50s !important; }
        .gacha-overlay.phase-shuffling.master-plus .gacha-deck-cluster { animation-duration: 1.65s !important; }
        .gacha-overlay.phase-shuffling .gacha-card-back {
          opacity: 1 !important;
          background-color: #0b1730 !important;
          background-image: linear-gradient(145deg, #14264a 0%, #0b1730 54%, #050a16 100%) !important;
          border-color: rgba(191,219,254,.44) !important;
          box-shadow: 0 22px 46px rgba(0,0,0,.58), 0 0 22px rgba(59,130,246,.22) !important;
          backdrop-filter: none !important;
        }
        .gacha-overlay.phase-selecting .gacha-deck-cluster {
          display: block !important;
          opacity: .72 !important;
          animation: none !important;
          transform: translate3d(0, 24px, 0) scale(.9) !important;
          filter: blur(.35px) saturate(.9) !important;
          transition: opacity .72s ease, transform .72s cubic-bezier(.2,.78,.22,1), filter .72s ease !important;
        }
        .gacha-overlay.phase-selecting .gacha-card-back {
          opacity: .92 !important;
          animation: none !important;
          background-color: #0b1730 !important;
          backdrop-filter: none !important;
        }
        .gacha-overlay.phase-approaching .gacha-deck-cluster,
        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          display: none !important;
          opacity: 0 !important;
          animation: none !important;
        }
        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 1 !important;
          animation: finalPickedSelectSmooth .88s cubic-bezier(.16,.88,.2,1) both !important;
          filter: drop-shadow(0 0 22px var(--current-stage-glow, var(--card-tier-glow))) !important;
        }
        .gacha-overlay.phase-approaching .gacha-picked-card {
          opacity: 1 !important;
          animation: finalPickedApproachSmooth 1.18s cubic-bezier(.18,.82,.18,1) both !important;
          filter: drop-shadow(0 0 28px var(--current-stage-glow, var(--card-tier-glow))) !important;
        }
        .gacha-overlay.phase-approaching.master-plus .gacha-picked-card {
          animation-duration: 1.34s !important;
        }
        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: finalPickedTierFloat 2.1s ease-in-out infinite alternate !important;
          filter: drop-shadow(0 0 30px var(--current-stage-glow, var(--card-tier-glow))) !important;
        }
        .gacha-overlay.phase-special_tension.master-plus .gacha-picked-card {
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: finalPickedSpecialFloat 2.25s ease-in-out infinite alternate !important;
          filter: drop-shadow(0 0 50px var(--current-stage-glow, var(--card-tier-glow))) !important;
        }
        .gacha-card-face.back,
        .gacha-card-face.front {
          opacity: 1 !important;
          backdrop-filter: none !important;
        }
        .gacha-card-face.back {
          background-color: #081326 !important;
          background-image: radial-gradient(circle at 70% 14%, rgba(96,165,250,.22), transparent 30%), linear-gradient(145deg, #15284d, #081326 58%, #020817) !important;
        }
        .gacha-card-face.front {
          background-color: var(--front-mid, #0f233a) !important;
        }
        .gacha-card-face.front .auction-front-stat {
          opacity: 1 !important;
          background-color: var(--stat-bottom, #091423) !important;
        }
        .gacha-speedlines,
        .gacha-light-burst,
        .gacha-ring,
        .gacha-shockwave,
        .gacha-sparkles {
          pointer-events: none !important;
        }
        .gacha-overlay.phase-selecting .gacha-light-burst { opacity: .24 !important; }
        .gacha-overlay.phase-approaching .gacha-light-burst { opacity: .34 !important; transition: opacity .8s ease, transform .9s cubic-bezier(.2,.8,.2,1) !important; }
        .gacha-overlay.phase-tier_ascending .gacha-light-burst { opacity: .48 !important; transition: opacity .9s ease, transform 1.05s cubic-bezier(.2,.8,.2,1), background .9s ease !important; }
        .gacha-overlay.phase-special_tension .gacha-light-burst { opacity: .58 !important; transition: opacity .9s ease, transform 1.05s cubic-bezier(.2,.8,.2,1), background .9s ease !important; }
        @keyframes finalPickedSelectSmooth {
          0% { opacity: 0; transform: translate3d(0, 118px, 0) scale(.34) rotate(0deg); }
          58% { opacity: 1; transform: translate3d(0, -26px, 0) scale(.86) rotate(-1.4deg); }
          100% { opacity: 1; transform: translate3d(0, -18px, 0) scale(.84) rotate(.8deg); }
        }
        @keyframes finalPickedApproachSmooth {
          0% { opacity: 1; transform: translate3d(0, -18px, 0) scale(.84) rotate(.8deg); }
          44% { opacity: 1; transform: translate3d(0, -36px, 0) scale(.94) rotate(-.5deg); }
          78% { opacity: 1; transform: translate3d(0, -10px, 0) scale(.99) rotate(.25deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }
        @keyframes finalPickedTierFloat {
          0% { transform: translate3d(0, 0, 0) scale(1) rotate(-.18deg); }
          100% { transform: translate3d(0, -6px, 0) scale(1.01) rotate(.18deg); }
        }
        @keyframes finalPickedSpecialFloat {
          0% { transform: translate3d(0, -1px, 0) scale(1.006) rotate(-.12deg); }
          100% { transform: translate3d(0, -10px, 0) scale(1.024) rotate(.12deg); }
        }


        /* K-LOL.GG shorter shuffle timing override */
        .gacha-overlay.phase-shuffling.gold-below .gacha-deck-cluster { animation-duration: 1.35s !important; }
        .gacha-overlay.phase-shuffling.ascent-tier .gacha-deck-cluster { animation-duration: 1.50s !important; }
        .gacha-overlay.phase-shuffling.master-plus .gacha-deck-cluster { animation-duration: 1.65s !important; }
      

        

        /* K-LOL.GG auction SVG clean consolidated final v1
           Cleans accumulated duplicate patch CSS and keeps one final source of truth.
           Covers: card backs, fan motion, selected card, SVG front slots, text alignment, and certificate badge. */

        .gacha-card-back {
          position: absolute !important;
          overflow: hidden !important;
          border: 0 !important;
          border-radius: 17px !important;
          background-color: #102a5f !important;
          background-image: url("/auction-cards/back-premium.svg") !important;
          background-size: 100% 100% !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          box-shadow:
            0 16px 34px rgba(0,0,0,.50),
            0 0 22px rgba(96,165,250,.26) !important;
          opacity: 1 !important;
          filter: none !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after {
          content: none !important;
          display: none !important;
        }

        .gacha-overlay.phase-shuffling .gacha-deck-cluster,
        .gacha-overlay.phase-selecting .gacha-deck-cluster {
          opacity: 1 !important;
          filter: none !important;
          transform: translate3d(0, 0, 0) scale(1) !important;
          will-change: transform, opacity !important;
        }

        .gacha-card-back.card-1 { --x: -236px !important; --y: 34px !important; --r: -17deg !important; --d: 0ms !important; }
        .gacha-card-back.card-2 { --x: -178px !important; --y: 15px !important; --r: -12deg !important; --d: 36ms !important; }
        .gacha-card-back.card-3 { --x: -120px !important; --y: 2px !important; --r: -8deg !important; --d: 72ms !important; }
        .gacha-card-back.card-4 { --x: -60px !important; --y: -7px !important; --r: -4deg !important; --d: 108ms !important; }
        .gacha-card-back.card-5 { --x: 0px !important; --y: -10px !important; --r: 0deg !important; --d: 144ms !important; }
        .gacha-card-back.card-6 { --x: 60px !important; --y: -7px !important; --r: 4deg !important; --d: 180ms !important; }
        .gacha-card-back.card-7 { --x: 120px !important; --y: 2px !important; --r: 8deg !important; --d: 216ms !important; }
        .gacha-card-back.card-8 { --x: 178px !important; --y: 15px !important; --r: 12deg !important; --d: 252ms !important; }
        .gacha-card-back.card-9 { --x: 236px !important; --y: 34px !important; --r: 17deg !important; --d: 288ms !important; }

        @keyframes klolSvgCleanFanSpread {
          0% { opacity: 0; transform: translate3d(0, 56px, 0) rotate(0deg) scale(.72); }
          18% { opacity: .72; transform: translate3d(0, 28px, 0) rotate(0deg) scale(.80); }
          70% { opacity: .98; transform: translate3d(calc(var(--x) * .94), calc(var(--y) + 4px), 0) rotate(var(--r)) scale(.92); }
          100% { opacity: 1; transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.94); }
        }

        @keyframes klolSvgCleanRestGather {
          0% { opacity: 1; transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.94); }
          46% { opacity: .84; transform: translate3d(calc(var(--x) * .52), calc(var(--y) + 15px), 0) rotate(calc(var(--r) * .52)) scale(.84); }
          100% { opacity: 0; transform: translate3d(0, 48px, 0) rotate(0deg) scale(.66); }
        }

        @keyframes klolSvgCleanSelected {
          0% { opacity: 1; transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.94); }
          28% { opacity: 1; transform: translate3d(calc(var(--x) * .76), calc(var(--y) - 30px), 0) rotate(calc(var(--r) * .76)) scale(1.02); }
          68% { opacity: 1; transform: translate3d(calc(var(--x) * .28), -18px, 0) rotate(calc(var(--r) * .28)) scale(1.08); }
          100% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0deg) scale(1.12); }
        }

        @keyframes klolSvgCleanMainBackAppear {
          0%, 58% { opacity: 0; transform: translate3d(0, -12px, 0) scale(.96) rotate(0deg); }
          78% { opacity: .72; transform: translate3d(0, -4px, 0) scale(.99) rotate(0deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }

        .gacha-overlay.phase-shuffling .gacha-card-back {
          animation: klolSvgCleanFanSpread .92s cubic-bezier(.16,.88,.18,1) both !important;
          animation-delay: var(--d) !important;
          transform-origin: center bottom !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolSvgCleanRestGather 1.02s cubic-bezier(.22,.84,.2,1) both !important;
          animation-delay: 300ms !important;
          transform-origin: center bottom !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 30 !important;
          animation: klolSvgCleanSelected 1.08s cubic-bezier(.18,.84,.2,1) both !important;
          animation-delay: 0ms !important;
          box-shadow:
            0 22px 52px rgba(0,0,0,.56),
            0 0 30px rgba(96,165,250,.34) !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 1 !important;
          animation: klolSvgCleanMainBackAppear 1.24s cubic-bezier(.18,.88,.2,1) both !important;
          filter: drop-shadow(0 22px 50px rgba(0,0,0,.48)) !important;
        }

        .gacha-card-face.back.auction-svg-card-back,
        .gacha-card-face.front.auction-svg-card-front {
          padding: 0 !important;
          border: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          overflow: hidden !important;
        }

        .gacha-card-face.back.auction-svg-card-back::before,
        .gacha-card-face.back.auction-svg-card-back::after,
        .gacha-card-face.front.auction-svg-card-front::before,
        .gacha-card-face.front.auction-svg-card-front::after {
          content: none !important;
          display: none !important;
        }

        .auction-svg-card-bg {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          z-index: 0 !important;
          pointer-events: none !important;
          user-select: none !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-shell::before,
        .gacha-overlay.phase-tier_ascending .gacha-picked-shell::after,
        .gacha-overlay.phase-special_tension .gacha-picked-shell::before,
        .gacha-overlay.phase-special_tension .gacha-picked-shell::after,
        .gacha-overlay.phase-flipping .gacha-picked-shell::before,
        .gacha-overlay.phase-flipping .gacha-picked-shell::after {
          content: none !important;
          display: none !important;
          animation: none !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card,
        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          filter: drop-shadow(0 24px 54px rgba(0,0,0,.48)) !important;
        }

        .auction-svg-card-content {
          position: absolute !important;
          inset: 0 !important;
          z-index: 2 !important;
          display: block !important;
          padding: 0 !important;
          color: #fff !important;
          text-align: center !important;
          pointer-events: none !important;
        }

        .auction-svg-player {
          position: absolute !important;
          left: 13.5% !important;
          right: 13.5% !important;
          top: 15.4% !important;
          height: 10.2% !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 6px !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          text-align: center !important;
          z-index: 6 !important;
        }

        .auction-svg-player-name {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          font-size: clamp(33px, 3vw, 41px) !important;
          font-weight: 950 !important;
          line-height: 1.02 !important;
          letter-spacing: -.045em !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          text-align: center !important;
          text-shadow:
            0 4px 14px rgba(0,0,0,.66),
            0 0 22px rgba(255,255,255,.22) !important;
        }

        .auction-svg-player-nick {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          font-size: clamp(13px, 1.15vw, 15px) !important;
          font-weight: 760 !important;
          line-height: 1.14 !important;
          letter-spacing: -.01em !important;
          color: rgba(239,246,255,.88) !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          text-align: center !important;
          text-shadow: 0 2px 8px rgba(0,0,0,.58) !important;
        }

        .auction-svg-tier-emblem {
          position: absolute !important;
          left: 50% !important;
          top: 31.6% !important;
          width: 184px !important;
          height: 184px !important;
          margin: 0 !important;
          transform: translate(-50%, 0) !important;
          border-radius: 50% !important;
          display: grid !important;
          place-items: center !important;
          background:
            radial-gradient(circle at 50% 34%, rgba(255,255,255,.13), transparent 35%),
            rgba(2,8,23,.30) !important;
          box-shadow:
            inset 0 0 24px rgba(255,255,255,.10),
            0 18px 38px rgba(0,0,0,.24),
            0 0 34px var(--card-tier-glow) !important;
          border: 2px solid color-mix(in srgb, var(--card-tier-border) 74%, white 10%) !important;
          overflow: hidden !important;
          z-index: 5 !important;
        }

        .auction-svg-tier-image {
          width: 160px !important;
          height: 160px !important;
          object-fit: contain !important;
          border-radius: 50% !important;
          background: transparent !important;
          mix-blend-mode: screen !important;
          filter:
            drop-shadow(0 14px 18px rgba(0,0,0,.30))
            drop-shadow(0 0 22px var(--card-tier-glow))
            saturate(1.12) contrast(1.08) brightness(1.04) !important;
        }

        .auction-svg-stats {
          position: absolute !important;
          left: 14.0% !important;
          right: 14.0% !important;
          top: 59.4% !important;
          display: grid !important;
          grid-template-rows: repeat(2, 56px) !important;
          gap: 10px !important;
          width: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: 5 !important;
        }

        .auction-svg-stat-row {
          width: 100% !important;
          height: 56px !important;
          min-height: 56px !important;
          display: grid !important;
          grid-template-columns: 106px minmax(0, 1fr) !important;
          align-items: center !important;
          gap: 15px !important;
          padding: 0 18px !important;
          border-radius: 13px !important;
          box-sizing: border-box !important;
          text-align: left !important;
          background: rgba(2,8,23,.68) !important;
          border: 1px solid color-mix(in srgb, var(--card-tier-border) 48%, rgba(255,255,255,.12)) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.11),
            0 10px 22px rgba(0,0,0,.20) !important;
          backdrop-filter: blur(1.5px) !important;
        }

        .auction-svg-stat-row span {
          display: flex !important;
          align-items: center !important;
          height: 100% !important;
          min-width: 0 !important;
          font-size: 13px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
          white-space: nowrap !important;
          color: color-mix(in srgb, var(--card-tier-border) 80%, #cbd5e1 20%) !important;
        }

        .auction-svg-stat-row strong {
          display: flex !important;
          align-items: center !important;
          height: 100% !important;
          min-width: 0 !important;
          font-size: clamp(21px, 1.85vw, 24px) !important;
          line-height: 1 !important;
          font-weight: 950 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          text-align: left !important;
          color: #fff !important;
          text-shadow:
            0 2px 8px rgba(0,0,0,.58),
            0 0 16px var(--card-tier-text-glow) !important;
        }

        .auction-svg-cert-badge {
          position: absolute !important;
          left: 50% !important;
          bottom: 9.2% !important;
          width: 154px !important;
          height: 62px !important;
          min-height: 62px !important;
          margin: 0 !important;
          padding: 9px 12px !important;
          transform: translateX(-50%) !important;
          clip-path: polygon(18% 0, 82% 0, 100% 50%, 82% 100%, 18% 100%, 0 50%) !important;
          border-radius: 0 !important;
          display: grid !important;
          align-content: center !important;
          justify-items: center !important;
          gap: 2px !important;
          box-sizing: border-box !important;
          color: #fff !important;
          text-align: center !important;
          background:
            radial-gradient(circle at 50% 25%, rgba(255,255,255,.24), transparent 30%),
            linear-gradient(145deg, color-mix(in srgb, var(--card-tier-primary) 78%, #111827 22%), var(--card-tier-secondary)) !important;
          border: 0 !important;
          box-shadow:
            inset 0 0 0 2px color-mix(in srgb, var(--card-tier-border) 82%, white 8%),
            0 0 26px var(--card-tier-glow),
            0 12px 24px rgba(0,0,0,.32) !important;
          text-shadow: 0 2px 8px rgba(0,0,0,.55) !important;
          z-index: 6 !important;
        }

        .auction-svg-cert-badge::before,
        .auction-svg-cert-badge::after {
          content: none !important;
          display: none !important;
        }

        .auction-svg-cert-badge span,
        .auction-svg-cert-badge strong {
          display: block !important;
          width: 100% !important;
          line-height: 1.05 !important;
          text-align: center !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .auction-svg-cert-badge span {
          font-size: 11px !important;
          font-weight: 900 !important;
          letter-spacing: .04em !important;
        }

        .auction-svg-cert-badge strong {
          font-size: 12px !important;
          font-weight: 950 !important;
          letter-spacing: .05em !important;
        }

        @media (max-height: 780px) {
          .auction-svg-player { top: 15.0% !important; height: 9.8% !important; }
          .auction-svg-player-name { font-size: clamp(29px, 2.7vw, 36px) !important; }
          .auction-svg-player-nick { font-size: 13px !important; }
          .auction-svg-tier-emblem { top: 31.1% !important; width: 160px !important; height: 160px !important; }
          .auction-svg-tier-image { width: 138px !important; height: 138px !important; }
          .auction-svg-stats { left: 14.4% !important; right: 14.4% !important; top: 59.8% !important; grid-template-rows: repeat(2, 50px) !important; gap: 9px !important; }
          .auction-svg-stat-row { height: 50px !important; min-height: 50px !important; grid-template-columns: 96px minmax(0, 1fr) !important; padding: 0 15px !important; }
          .auction-svg-stat-row span { font-size: 12px !important; }
          .auction-svg-stat-row strong { font-size: 21px !important; }
          .auction-svg-cert-badge { bottom: 8.6% !important; width: 136px !important; height: 56px !important; min-height: 56px !important; }
          .auction-svg-cert-badge span { font-size: 10px !important; }
          .auction-svg-cert-badge strong { font-size: 11px !important; }
        }


        /* K-LOL.GG auction emblem and badge tier text patch v1
           Requested changes:
           - move only the tier emblem slightly upward
           - certificate badge should show only the tier text
           - badge text color should be more distinct / premium
        */

        .auction-svg-tier-emblem {
          position: absolute !important;
          left: 50% !important;
          top: 29.9% !important;
          transform: translate(-50%, 0) !important;
          z-index: 5 !important;
        }

        .auction-svg-cert-badge {
          display: grid !important;
          align-content: center !important;
          justify-items: center !important;
          gap: 0 !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }

        .auction-svg-cert-badge span {
          display: none !important;
        }

        .auction-svg-cert-badge strong {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          font-size: 18px !important;
          font-weight: 1000 !important;
          line-height: 1 !important;
          letter-spacing: .08em !important;
          color: color-mix(in srgb, var(--card-tier-border) 78%, #ffffff 22%) !important;
          text-shadow:
            0 2px 10px rgba(0,0,0,.55),
            0 0 14px color-mix(in srgb, var(--card-tier-glow) 85%, #ffffff 15%) !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          text-transform: uppercase !important;
        }

        @media (max-height: 780px) {
          .auction-svg-tier-emblem {
            top: 29.4% !important;
          }

          .auction-svg-cert-badge strong {
            font-size: 16px !important;
          }
        }

        /* K-LOL.GG auction emblem up fine tune patch v1
           Fine-tune only:
           - move the center tier emblem a little more upward
           - keep all other current placements unchanged
        */

        .auction-svg-tier-emblem {
          position: absolute !important;
          left: 50% !important;
          top: 28.7% !important;
          transform: translate(-50%, 0) !important;
          z-index: 5 !important;
        }

        @media (max-height: 780px) {
          .auction-svg-tier-emblem {
            top: 28.2% !important;
          }
        }

        /* K-LOL.GG auction name emblem motion cleanup patch v1
           Requested changes:
           - move name block slightly upward
           - move tier emblem slightly upward
           - hide remaining back cards after the fan stage so the back side does not keep showing
           - soften / smooth the fan and picked-card motion to reduce step-like movement
        */

        .auction-svg-player {
          top: 14.6% !important;
          height: 9.8% !important;
        }

        .auction-svg-tier-emblem {
          position: absolute !important;
          left: 50% !important;
          top: 27.9% !important;
          transform: translate(-50%, 0) translateZ(0) !important;
          z-index: 5 !important;
          will-change: transform, opacity !important;
          backface-visibility: hidden !important;
        }

        .gacha-deck-cluster,
        .gacha-card-back,
        .gacha-picked-card,
        .gacha-card-inner,
        .gacha-card-face.back,
        .gacha-card-face.front {
          backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-picked-card,
        .gacha-deck-cluster {
          transform: translateZ(0) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translateY(58px) scale(.74) translateZ(0) !important;
          transition:
            opacity .34s ease,
            transform .42s cubic-bezier(.22,.82,.22,1),
            filter .34s ease,
            visibility 0s linear .34s !important;
        }

        .gacha-overlay.animating .gacha-deck-cluster {
          animation: lineDeckSweepRefined 5.5s cubic-bezier(.22,.84,.22,1) both !important;
        }

        .gacha-overlay.animating.high-tier .gacha-deck-cluster {
          animation-duration: 6.3s !important;
        }

        .gacha-overlay.animating .gacha-card-back {
          animation:
            lineFanOutRefined 1.82s cubic-bezier(.2,.84,.2,1) both,
            lineCardBreath 1.55s ease-in-out infinite !important;
          animation-delay: var(--d), calc(1.9s + var(--d)) !important;
        }

        .gacha-overlay.animating.high-tier .gacha-card-back {
          animation-duration: 2.0s, 1.16s !important;
        }

        .gacha-overlay.animating .gacha-picked-card {
          animation: selectedLineCardRefined 5.5s cubic-bezier(.22,.88,.22,1) forwards !important;
        }

        .gacha-overlay.animating.high-tier .gacha-picked-card {
          animation: selectedLineCardHighRefined 6.3s cubic-bezier(.22,.9,.22,1) forwards !important;
        }

        .gacha-card-inner {
          transition: transform 1.55s cubic-bezier(.22,.82,.22,1) !important;
        }

        .gacha-overlay.revealed.high-tier .gacha-card-inner {
          transition-duration: 2.2s !important;
        }

        @keyframes lineDeckSweepRefined {
          0% { transform: translateY(18px) scale(.97) translateZ(0); filter: brightness(.82); }
          22% { transform: translateY(12px) scale(1) translateZ(0); filter: brightness(.98); }
          48% { transform: translateY(4px) scale(1.015) translateZ(0); filter: brightness(1.06); }
          76% { transform: translateY(8px) scale(1) translateZ(0); filter: brightness(1.01); }
          100% { transform: translateY(18px) scale(.95) translateZ(0); filter: brightness(.82); }
        }

        @keyframes lineFanOutRefined {
          0% { opacity: 0; transform: translate(-420px, 86px) rotate(-22deg) scale(.5) translateZ(0); }
          46% { opacity: 1; transform: translate(calc(var(--x) * .48), 30px) rotate(calc(var(--r) * .46)) scale(.69) translateZ(0); }
          78% { opacity: .98; transform: translate(var(--x), 8px) rotate(var(--r)) scale(.81) translateZ(0); }
          100% { opacity: .88; transform: translate(var(--x), 14px) rotate(var(--r)) scale(.77) translateZ(0); }
        }

        @keyframes selectedLineCardRefined {
          0% { opacity: 0; transform: translate3d(0, 126px, 0) scale(.34) rotate(0deg); }
          28% { opacity: 0; transform: translate3d(0, 126px, 0) scale(.34) rotate(0deg); }
          42% { opacity: 1; transform: translate3d(0, 84px, 0) scale(.5) rotate(0deg); }
          58% { opacity: 1; transform: translate3d(0, 18px, 0) scale(.73) rotate(-3deg); }
          74% { opacity: 1; transform: translate3d(0, -40px, 0) scale(.92) rotate(2deg); }
          88% { opacity: 1; transform: translate3d(0, -18px, 0) scale(1.02) rotate(-1deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }

        @keyframes selectedLineCardHighRefined {
          0% { opacity: 0; transform: translate3d(0, 136px, 0) scale(.3) rotate(0deg); }
          30% { opacity: 0; transform: translate3d(0, 136px, 0) scale(.3) rotate(0deg); }
          44% { opacity: 1; transform: translate3d(0, 94px, 0) scale(.48) rotate(0deg); }
          60% { opacity: 1; transform: translate3d(0, 22px, 0) scale(.72) rotate(-4deg); }
          76% { opacity: 1; transform: translate3d(0, -46px, 0) scale(.95) rotate(3deg); }
          90% { opacity: 1; transform: translate3d(0, -22px, 0) scale(1.04) rotate(-1.5deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }

        @media (max-height: 780px) {
          .auction-svg-player {
            top: 14.2% !important;
            height: 9.4% !important;
          }

          .auction-svg-tier-emblem {
            top: 27.4% !important;
          }
        }

        /* K-LOL.GG auction video state motion back patch v1
           Current video-state fixes:
           - move name block slightly upward
           - move tier emblem slightly upward
           - make fan-spread back cards visibly use the premium back image
           - reduce abrupt selected-card pop by using a smoother selected-card path
           - hide remaining fan cards cleanly after the selected card is promoted
        */

        .auction-svg-player {
          top: 13.8% !important;
          height: 9.8% !important;
        }

        .auction-svg-tier-emblem {
          position: absolute !important;
          left: 50% !important;
          top: 26.8% !important;
          transform: translate(-50%, 0) translateZ(0) !important;
          z-index: 5 !important;
          will-change: transform, opacity !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
        }

        .gacha-deck-cluster {
          width: 640px !important;
          height: 300px !important;
          opacity: 1 !important;
          filter: none !important;
          will-change: transform, opacity, filter !important;
          transform-style: preserve-3d !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
        }

        .gacha-card-back {
          position: absolute !important;
          overflow: hidden !important;
          border: 0 !important;
          border-radius: 16px !important;
          background-color: #163d82 !important;
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          background-position: center, center !important;
          background-repeat: no-repeat, no-repeat !important;
          opacity: 1 !important;
          filter: brightness(1.12) saturate(1.08) !important;
          box-shadow:
            0 16px 34px rgba(0,0,0,.50),
            0 0 24px rgba(96,165,250,.30) !important;
          transform-style: preserve-3d !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after {
          content: none !important;
          display: none !important;
        }

        .gacha-card-back.card-1 { --x: -246px !important; --y: 34px !important; --r: -16deg !important; --d: 0ms !important; }
        .gacha-card-back.card-2 { --x: -184px !important; --y: 17px !important; --r: -12deg !important; --d: 42ms !important; }
        .gacha-card-back.card-3 { --x: -123px !important; --y: 5px !important; --r: -8deg !important; --d: 84ms !important; }
        .gacha-card-back.card-4 { --x: -62px !important; --y: -3px !important; --r: -4deg !important; --d: 126ms !important; }
        .gacha-card-back.card-5 { --x: 0px !important; --y: -6px !important; --r: 0deg !important; --d: 168ms !important; }
        .gacha-card-back.card-6 { --x: 62px !important; --y: -3px !important; --r: 4deg !important; --d: 210ms !important; }
        .gacha-card-back.card-7 { --x: 123px !important; --y: 5px !important; --r: 8deg !important; --d: 252ms !important; }
        .gacha-card-back.card-8 { --x: 184px !important; --y: 17px !important; --r: 12deg !important; --d: 294ms !important; }
        .gacha-card-back.card-9 { --x: 246px !important; --y: 34px !important; --r: 16deg !important; --d: 336ms !important; }

        .gacha-overlay.phase-shuffling .gacha-card-back,
        .gacha-overlay.animating .gacha-card-back {
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          opacity: 1 !important;
          filter: brightness(1.16) saturate(1.12) !important;
          animation:
            klolFanBackVisibleSmooth 1.72s cubic-bezier(.2,.82,.2,1) both,
            lineCardBreath 1.58s ease-in-out infinite !important;
          animation-delay: var(--d), calc(1.82s + var(--d)) !important;
        }

        .gacha-overlay.animating.high-tier .gacha-card-back {
          animation-duration: 1.92s, 1.16s !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          opacity: .96 !important;
          filter: brightness(1.14) saturate(1.10) !important;
          animation: klolFanBackGatherSmooth .86s cubic-bezier(.22,.8,.22,1) both !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 40 !important;
          opacity: 1 !important;
          filter: brightness(1.18) saturate(1.14) !important;
          animation: klolFanPickedToCenterSmooth 1.04s cubic-bezier(.2,.84,.2,1) both !important;
          box-shadow:
            0 22px 52px rgba(0,0,0,.56),
            0 0 32px rgba(96,165,250,.36) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translateY(54px) scale(.72) translateZ(0) !important;
          transition:
            opacity .28s ease,
            transform .38s cubic-bezier(.22,.82,.22,1),
            filter .28s ease,
            visibility 0s linear .28s !important;
        }

        .gacha-overlay.animating .gacha-picked-card {
          animation: klolPickedCardSmoothPromote 5.35s cubic-bezier(.22,.88,.22,1) forwards !important;
          filter: drop-shadow(0 22px 50px rgba(0,0,0,.48)) !important;
          will-change: transform, opacity, filter !important;
          transform-style: preserve-3d !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
        }

        .gacha-overlay.animating.high-tier .gacha-picked-card {
          animation: klolPickedCardSmoothPromoteHigh 6.05s cubic-bezier(.22,.9,.22,1) forwards !important;
        }

        .gacha-card-inner {
          transition: transform 1.48s cubic-bezier(.22,.82,.22,1) !important;
          transform-style: preserve-3d !important;
          will-change: transform !important;
        }

        @keyframes klolFanBackVisibleSmooth {
          0% {
            opacity: 0;
            transform: translate3d(-380px, 78px, 0) rotate(-20deg) scale(.54);
          }
          34% {
            opacity: .78;
            transform: translate3d(calc(var(--x) * .34), 42px, 0) rotate(calc(var(--r) * .34)) scale(.66);
          }
          72% {
            opacity: 1;
            transform: translate3d(var(--x), calc(var(--y) + 4px), 0) rotate(var(--r)) scale(.80);
          }
          100% {
            opacity: 1;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
        }

        @keyframes klolFanBackGatherSmooth {
          0% {
            opacity: 1;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          58% {
            opacity: .74;
            transform: translate3d(calc(var(--x) * .44), calc(var(--y) + 18px), 0) rotate(calc(var(--r) * .4)) scale(.64);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 56px, 0) rotate(0deg) scale(.48);
          }
        }

        @keyframes klolFanPickedToCenterSmooth {
          0% {
            opacity: 1;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          40% {
            opacity: 1;
            transform: translate3d(calc(var(--x) * .62), -30px, 0) rotate(calc(var(--r) * .58)) scale(.90);
          }
          78% {
            opacity: .95;
            transform: translate3d(calc(var(--x) * .14), -10px, 0) rotate(calc(var(--r) * .16)) scale(1.02);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.07);
          }
        }

        @keyframes klolPickedCardSmoothPromote {
          0%, 34% {
            opacity: 0;
            transform: translate3d(0, 112px, 0) scale(.36) rotate(0deg);
          }
          48% {
            opacity: .55;
            transform: translate3d(0, 74px, 0) scale(.52) rotate(0deg);
          }
          64% {
            opacity: .92;
            transform: translate3d(0, 18px, 0) scale(.76) rotate(-2deg);
          }
          80% {
            opacity: 1;
            transform: translate3d(0, -24px, 0) scale(.96) rotate(1deg);
          }
          92% {
            opacity: 1;
            transform: translate3d(0, -8px, 0) scale(1.02) rotate(-.5deg);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes klolPickedCardSmoothPromoteHigh {
          0%, 36% {
            opacity: 0;
            transform: translate3d(0, 126px, 0) scale(.32) rotate(0deg);
          }
          50% {
            opacity: .52;
            transform: translate3d(0, 84px, 0) scale(.50) rotate(0deg);
          }
          66% {
            opacity: .92;
            transform: translate3d(0, 20px, 0) scale(.76) rotate(-3deg);
          }
          82% {
            opacity: 1;
            transform: translate3d(0, -30px, 0) scale(.98) rotate(1.5deg);
          }
          93% {
            opacity: 1;
            transform: translate3d(0, -10px, 0) scale(1.03) rotate(-.7deg);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @media (max-height: 780px) {
          .auction-svg-player {
            top: 13.4% !important;
            height: 9.4% !important;
          }

          .auction-svg-tier-emblem {
            top: 26.4% !important;
          }
        }

        /* K-LOL.GG auction draw stutter fix patch v1
           Fixes the hard cut around SELECTING -> TIER_ASCENDING.
           Main cause: previous long picked-card animation was interrupted by the next phase.
           This patch makes SELECTING settle inside the phase duration, keeps the same final transform,
           and only then lets tier checking start. */

        .gacha-card-back {
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          background-position: center, center !important;
          background-repeat: no-repeat, no-repeat !important;
          opacity: 1 !important;
          filter: brightness(1.12) saturate(1.08) !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after {
          content: none !important;
          display: none !important;
        }

        .gacha-deck-cluster,
        .gacha-picked-card,
        .gacha-card-inner,
        .gacha-card-face.back,
        .gacha-card-face.front {
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-overlay.phase-shuffling .gacha-picked-card {
          opacity: 0 !important;
          transform: translate3d(0, 112px, 0) scale(.34) rotate(0deg) !important;
          animation: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolDrawGatherBacksSmooth .98s cubic-bezier(.22,.84,.22,1) both !important;
          animation-delay: 0ms !important;
          filter: brightness(1.12) saturate(1.08) !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 42 !important;
          opacity: 1 !important;
          filter: brightness(1.18) saturate(1.14) !important;
          animation: klolDrawChosenBackToCenterSmooth 1.02s cubic-bezier(.2,.84,.2,1) both !important;
          animation-delay: 0ms !important;
          box-shadow:
            0 22px 52px rgba(0,0,0,.56),
            0 0 32px rgba(96,165,250,.36) !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 1 !important;
          animation: klolDrawMainPickedFadeInSmooth 1.02s cubic-bezier(.22,.84,.22,1) both !important;
          filter: drop-shadow(0 22px 50px rgba(0,0,0,.48)) !important;
          transform-origin: center center !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: klolDrawTierSoftHold 1.35s ease-in-out infinite alternate !important;
          filter: drop-shadow(0 24px 54px rgba(0,0,0,.48)) !important;
        }

        .gacha-overlay.phase-special_tension .gacha-picked-card {
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: klolDrawTierSoftHoldHigh 1.35s ease-in-out infinite alternate !important;
          filter: drop-shadow(0 24px 54px rgba(0,0,0,.48)) !important;
        }

        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: none !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translate3d(0, 52px, 0) scale(.72) !important;
          transition:
            opacity .24s ease,
            transform .34s cubic-bezier(.22,.82,.22,1),
            filter .24s ease,
            visibility 0s linear .24s !important;
        }

        .gacha-card-inner {
          transition: transform 1.34s cubic-bezier(.22,.82,.22,1) !important;
        }

        @keyframes klolDrawGatherBacksSmooth {
          0% {
            opacity: .96;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          52% {
            opacity: .62;
            transform: translate3d(calc(var(--x) * .46), calc(var(--y) + 18px), 0) rotate(calc(var(--r) * .45)) scale(.64);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 54px, 0) rotate(0deg) scale(.48);
          }
        }

        @keyframes klolDrawChosenBackToCenterSmooth {
          0% {
            opacity: 1;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          38% {
            opacity: 1;
            transform: translate3d(calc(var(--x) * .62), -24px, 0) rotate(calc(var(--r) * .58)) scale(.90);
          }
          72% {
            opacity: 1;
            transform: translate3d(calc(var(--x) * .18), -6px, 0) rotate(calc(var(--r) * .16)) scale(1.02);
          }
          90% {
            opacity: .68;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.06);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.06);
          }
        }

        @keyframes klolDrawMainPickedFadeInSmooth {
          0%, 58% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(1.06) rotate(0deg);
          }
          74% {
            opacity: .36;
            transform: translate3d(0, 0, 0) scale(1.035) rotate(0deg);
          }
          92% {
            opacity: .92;
            transform: translate3d(0, 0, 0) scale(1.01) rotate(0deg);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes klolDrawTierSoftHold {
          from {
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
            filter: drop-shadow(0 22px 50px rgba(0,0,0,.46));
          }
          to {
            transform: translate3d(0, -4px, 0) scale(1.008) rotate(0deg);
            filter: drop-shadow(0 26px 56px rgba(0,0,0,.50));
          }
        }

        @keyframes klolDrawTierSoftHoldHigh {
          from {
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
            filter: drop-shadow(0 24px 54px rgba(0,0,0,.48)) drop-shadow(0 0 18px var(--card-tier-glow));
          }
          to {
            transform: translate3d(0, -5px, 0) scale(1.012) rotate(0deg);
            filter: drop-shadow(0 28px 62px rgba(0,0,0,.52)) drop-shadow(0 0 24px var(--card-tier-glow));
          }
        }

        /* K-LOL.GG auction draw seamless final patch v1
           Final draw-flow stabilization:
           - no blank card at the last/reveal phase
           - selected back-card bridges smoothly into the main picked card
           - fan cards gather without a hard cut
           - phase changes keep identical final transform, so the card does not jump
        */

        .gacha-card-back,
        .gacha-card-face.back.auction-svg-card-back {
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          background-position: center, center !important;
          background-repeat: no-repeat, no-repeat !important;
          opacity: 1 !important;
          filter: brightness(1.12) saturate(1.08) !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after,
        .gacha-card-face.back.auction-svg-card-back::before,
        .gacha-card-face.back.auction-svg-card-back::after,
        .gacha-card-face.front.auction-svg-card-front::before,
        .gacha-card-face.front.auction-svg-card-front::after {
          content: none !important;
          display: none !important;
        }

        .gacha-deck-cluster,
        .gacha-card-back,
        .gacha-picked-card,
        .gacha-card-inner,
        .gacha-card-face.back,
        .gacha-card-face.front {
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-card-face.back.auction-svg-card-back,
        .gacha-card-face.front.auction-svg-card-front {
          padding: 0 !important;
          border: 0 !important;
          background-color: transparent !important;
          box-shadow: none !important;
          overflow: hidden !important;
        }

        .auction-svg-card-bg {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          z-index: 0 !important;
          pointer-events: none !important;
          user-select: none !important;
        }

        .gacha-overlay.phase-shuffling .gacha-picked-card {
          opacity: 0 !important;
          visibility: visible !important;
          transform: translate3d(0, 112px, 0) scale(.34) rotate(0deg) !important;
          animation: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolSeamlessFanGather .98s cubic-bezier(.22,.84,.22,1) both !important;
          animation-delay: 60ms !important;
          filter: brightness(1.12) saturate(1.08) !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 44 !important;
          opacity: 1 !important;
          filter: brightness(1.18) saturate(1.14) !important;
          animation: klolSeamlessChosenBackBridge 1.16s cubic-bezier(.2,.84,.2,1) both !important;
          animation-delay: 0ms !important;
          box-shadow:
            0 22px 52px rgba(0,0,0,.56),
            0 0 32px rgba(96,165,250,.36) !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
          animation: klolSeamlessMainBackBridge 1.16s cubic-bezier(.22,.84,.22,1) both !important;
          filter: drop-shadow(0 22px 50px rgba(0,0,0,.48)) !important;
          transform-origin: center center !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card,
        .gacha-overlay.phase-special_tension .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: klolSeamlessTierHold 1.35s ease-in-out infinite alternate !important;
          filter: drop-shadow(0 24px 54px rgba(0,0,0,.48)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-card-inner,
        .gacha-overlay.phase-special_tension .gacha-card-inner {
          transform: rotateY(0deg) !important;
          transition: transform 1.2s cubic-bezier(.22,.82,.22,1) !important;
        }

        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: none !important;
          filter: drop-shadow(0 24px 54px rgba(0,0,0,.48)) !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-inner,
        .gacha-overlay.revealed .gacha-card-inner {
          transform: rotateY(180deg) !important;
          transition: transform 1.34s cubic-bezier(.22,.82,.22,1) !important;
        }

        .gacha-overlay.phase-flipping.high-tier .gacha-card-inner,
        .gacha-overlay.revealed.high-tier .gacha-card-inner {
          transition-duration: 1.7s !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-face.front,
        .gacha-overlay.revealed .gacha-card-face.front {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-face.back,
        .gacha-overlay.revealed .gacha-card-face.back {
          visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translate3d(0, 52px, 0) scale(.72) !important;
          transition:
            opacity .24s ease,
            transform .34s cubic-bezier(.22,.82,.22,1),
            filter .24s ease,
            visibility 0s linear .24s !important;
        }

        @keyframes klolSeamlessFanGather {
          0% {
            opacity: .96;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          56% {
            opacity: .64;
            transform: translate3d(calc(var(--x) * .44), calc(var(--y) + 18px), 0) rotate(calc(var(--r) * .45)) scale(.64);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 54px, 0) rotate(0deg) scale(.48);
          }
        }

        @keyframes klolSeamlessChosenBackBridge {
          0% {
            opacity: 1;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          34% {
            opacity: 1;
            transform: translate3d(calc(var(--x) * .62), -24px, 0) rotate(calc(var(--r) * .58)) scale(.90);
          }
          66% {
            opacity: 1;
            transform: translate3d(calc(var(--x) * .18), -6px, 0) rotate(calc(var(--r) * .16)) scale(1.02);
          }
          86% {
            opacity: .94;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.055);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.055);
          }
        }

        @keyframes klolSeamlessMainBackBridge {
          0%, 44% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(1.055) rotate(0deg);
          }
          62% {
            opacity: .32;
            transform: translate3d(0, 0, 0) scale(1.04) rotate(0deg);
          }
          84% {
            opacity: .88;
            transform: translate3d(0, 0, 0) scale(1.012) rotate(0deg);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes klolSeamlessTierHold {
          from {
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
            filter: drop-shadow(0 22px 50px rgba(0,0,0,.46));
          }
          to {
            transform: translate3d(0, -4px, 0) scale(1.008) rotate(0deg);
            filter: drop-shadow(0 26px 56px rgba(0,0,0,.50));
          }
        }

        /* K-LOL.GG auction final no blank no stutter override v1
           Fix:
           - final revealed card invisible issue
           - selected card transition blank frame
           - picked card hard cut between SELECTING and TIER_ASCENDING
           - keep front/back faces visible only through correct 3D rules
        */

        .gacha-card-inner {
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
          transform-style: preserve-3d !important;
          will-change: transform !important;
        }

        .gacha-card-face,
        .gacha-card-face.back,
        .gacha-card-face.front {
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
        }

        .gacha-card-face.front.auction-svg-card-front {
          transform: rotateY(180deg) !important;
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-card-face.back.auction-svg-card-back {
          transform: rotateY(0deg) !important;
          opacity: 1 !important;
          visibility: visible !important;
        }

        .auction-svg-card-bg,
        .auction-svg-card-content {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-card-back {
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          background-position: center, center !important;
          background-repeat: no-repeat, no-repeat !important;
          opacity: 1 !important;
          filter: brightness(1.12) saturate(1.08) !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after {
          content: none !important;
          display: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          animation: klolNoBlankMainCardBridge 1.12s cubic-bezier(.22,.84,.22,1) both !important;
          transform-origin: center center !important;
          filter: drop-shadow(0 22px 50px rgba(0,0,0,.48)) !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 44 !important;
          opacity: 1 !important;
          filter: brightness(1.18) saturate(1.14) !important;
          animation: klolNoBlankChosenBackBridge 1.12s cubic-bezier(.2,.84,.2,1) both !important;
          animation-delay: 0ms !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolNoBlankRestBackGather .92s cubic-bezier(.22,.84,.22,1) both !important;
          animation-delay: 80ms !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card,
        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          filter: drop-shadow(0 24px 54px rgba(0,0,0,.48)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-card-inner,
        .gacha-overlay.phase-special_tension .gacha-card-inner {
          transform: rotateY(0deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-inner,
        .gacha-overlay.revealed .gacha-card-inner {
          transform: rotateY(180deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.revealed .gacha-card-face.front.auction-svg-card-front,
        .gacha-overlay.phase-flipping .gacha-card-face.front.auction-svg-card-front {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-overlay.revealed .auction-svg-card-bg,
        .gacha-overlay.revealed .auction-svg-card-content,
        .gacha-overlay.phase-flipping .auction-svg-card-bg,
        .gacha-overlay.phase-flipping .auction-svg-card-content {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translate3d(0, 52px, 0) scale(.72) !important;
          transition:
            opacity .24s ease,
            transform .34s cubic-bezier(.22,.82,.22,1),
            filter .24s ease,
            visibility 0s linear .24s !important;
        }

        @keyframes klolNoBlankChosenBackBridge {
          0% {
            opacity: 1;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          36% {
            opacity: 1;
            transform: translate3d(calc(var(--x) * .62), -24px, 0) rotate(calc(var(--r) * .58)) scale(.90);
          }
          68% {
            opacity: 1;
            transform: translate3d(calc(var(--x) * .18), -6px, 0) rotate(calc(var(--r) * .16)) scale(1.02);
          }
          88% {
            opacity: .72;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.055);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.055);
          }
        }

        @keyframes klolNoBlankMainCardBridge {
          0%, 42% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(1.055) rotate(0deg);
          }
          62% {
            opacity: .48;
            transform: translate3d(0, 0, 0) scale(1.035) rotate(0deg);
          }
          82% {
            opacity: .92;
            transform: translate3d(0, 0, 0) scale(1.012) rotate(0deg);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes klolNoBlankRestBackGather {
          0% {
            opacity: .96;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }
          58% {
            opacity: .62;
            transform: translate3d(calc(var(--x) * .44), calc(var(--y) + 18px), 0) rotate(calc(var(--r) * .45)) scale(.64);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 54px, 0) rotate(0deg) scale(.48);
          }
        }

        /* K-LOL.GG auction real draw motion override v1
           Goal:
           - 카드가 나열된 뒤 큰 카드가 갑자기 나타나는 느낌 제거
           - 선택된 작은 뒷장 카드가 실제로 위로 빠져나와 중앙으로 당겨지는 느낌
           - 중앙 도착 후 큰 카드와 자연스럽게 hand-off
        */

        .gacha-card-back {
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          background-position: center, center !important;
          background-repeat: no-repeat, no-repeat !important;
          opacity: 1 !important;
          filter: brightness(1.12) saturate(1.08) !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after {
          content: none !important;
          display: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolRealDrawRestCardsGather 1.08s cubic-bezier(.22,.78,.22,1) both !important;
          animation-delay: 180ms !important;
          transform-origin: center center !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 80 !important;
          opacity: 1 !important;
          filter: brightness(1.2) saturate(1.16) !important;
          animation: klolRealDrawChosenCard 1.34s cubic-bezier(.18,.88,.18,1) both !important;
          animation-delay: 0ms !important;
          box-shadow:
            0 28px 70px rgba(0,0,0,.62),
            0 0 42px rgba(96,165,250,.42) !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          animation: klolRealDrawMainCardHandOff 1.34s cubic-bezier(.22,.84,.22,1) both !important;
          transform-origin: center center !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card,
        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-card-inner,
        .gacha-overlay.phase-special_tension .gacha-card-inner {
          transform: rotateY(0deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-inner,
        .gacha-overlay.revealed .gacha-card-inner {
          transform: rotateY(180deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translate3d(0, 56px, 0) scale(.72) !important;
          transition:
            opacity .26s ease,
            transform .36s cubic-bezier(.22,.82,.22,1),
            filter .26s ease,
            visibility 0s linear .26s !important;
        }

        @keyframes klolRealDrawChosenCard {
          0% {
            opacity: 1;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }

          /* 나열된 카드에서 한 장이 먼저 위로 빠져나오는 구간 */
          22% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .92), calc(var(--y) - 70px), 0)
              rotate(calc(var(--r) * .72))
              scale(.92);
          }

          /* 뽑힌 카드가 중앙 쪽으로 당겨지는 구간 */
          52% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .42), -54px, 0)
              rotate(calc(var(--r) * .32))
              scale(1.46);
          }

          /* 중앙 큰 카드 크기와 거의 맞추는 구간 */
          78% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .08), -10px, 0)
              rotate(calc(var(--r) * .08))
              scale(2.42);
          }

          /* 큰 카드와 겹쳐지면서 hand-off */
          92% {
            opacity: .86;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(2.66);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(2.66);
          }
        }

        @keyframes klolRealDrawMainCardHandOff {
          0%, 72% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(.98) rotate(0deg);
          }

          84% {
            opacity: .44;
            transform: translate3d(0, 0, 0) scale(1.015) rotate(0deg);
          }

          94% {
            opacity: .92;
            transform: translate3d(0, 0, 0) scale(1.004) rotate(0deg);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes klolRealDrawRestCardsGather {
          0% {
            opacity: .94;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }

          48% {
            opacity: .66;
            transform:
              translate3d(calc(var(--x) * .46), calc(var(--y) + 18px), 0)
              rotate(calc(var(--r) * .42))
              scale(.64);
          }

          100% {
            opacity: 0;
            transform: translate3d(0, 58px, 0) rotate(0deg) scale(.48);
          }
        }

        /* K-LOL.GG auction real selected draw card class patch v1
           Fix:
           - draw-card-N class is now attached to overlay
           - selected small card actually lifts out from the fan
           - big card waits until selected small card reaches center
        */

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolActualRestCardsGather 1.34s cubic-bezier(.22,.78,.22,1) both !important;
          animation-delay: 320ms !important;
          transform-origin: center center !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 100 !important;
          opacity: 1 !important;
          visibility: visible !important;
          filter: brightness(1.24) saturate(1.18) !important;
          animation: klolActualSelectedCardPulled 1.62s cubic-bezier(.18,.88,.18,1) both !important;
          animation-delay: 0ms !important;
          box-shadow:
            0 32px 84px rgba(0,0,0,.66),
            0 0 52px rgba(96,165,250,.48) !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          animation: klolActualMainCardHandoff 1.62s cubic-bezier(.22,.84,.22,1) both !important;
          transform-origin: center center !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card,
        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        @keyframes klolActualSelectedCardPulled {
          0% {
            opacity: 1;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          /* 한 장이 카드열에서 위로 빠져나오는 단계 */
          20% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .96), calc(var(--y) - 82px), 0)
              rotate(calc(var(--r) * .70))
              scale(.96);
          }

          /* 뽑힌 카드가 위에서 잠깐 보이는 단계 */
          38% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .94), calc(var(--y) - 88px), 0)
              rotate(calc(var(--r) * .56))
              scale(1.02);
          }

          /* 중앙으로 당겨지는 단계 */
          62% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .36), -54px, 0)
              rotate(calc(var(--r) * .22))
              scale(1.56);
          }

          /* 큰 카드와 크기를 맞춰가는 단계 */
          84% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .06), -8px, 0)
              rotate(calc(var(--r) * .05))
              scale(2.42);
          }

          94% {
            opacity: .82;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(2.66);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(2.66);
          }
        }

        @keyframes klolActualMainCardHandoff {
          0%, 78% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(.99) rotate(0deg);
          }

          88% {
            opacity: .38;
            transform: translate3d(0, 0, 0) scale(1.014) rotate(0deg);
          }

          96% {
            opacity: .94;
            transform: translate3d(0, 0, 0) scale(1.004) rotate(0deg);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes klolActualRestCardsGather {
          0% {
            opacity: .94;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          30% {
            opacity: .9;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.76);
          }

          66% {
            opacity: .54;
            transform:
              translate3d(calc(var(--x) * .42), calc(var(--y) + 18px), 0)
              rotate(calc(var(--r) * .38))
              scale(.62);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 58px, 0)
              rotate(0deg)
              scale(.46);
          }
        }

        /* K-LOL.GG auction no overlap draw to big card patch v1
           Fix:
           - small pulled card and large picked card were visible together
           - SELECTING phase now shows only the pulled small card
           - large card appears only after SELECTING ends, during TIER_ASCENDING
        */

        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 0 !important;
          visibility: hidden !important;
          animation: none !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          pointer-events: none !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 120 !important;
          opacity: 1 !important;
          visibility: visible !important;
          filter: brightness(1.24) saturate(1.18) !important;
          animation: klolNoOverlapPulledCardOnly 1.58s cubic-bezier(.18,.88,.18,1) both !important;
          animation-delay: 0ms !important;
          box-shadow:
            0 32px 84px rgba(0,0,0,.66),
            0 0 52px rgba(96,165,250,.48) !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolNoOverlapRestCardsGather 1.34s cubic-bezier(.22,.78,.22,1) both !important;
          animation-delay: 320ms !important;
          transform-origin: center center !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card,
        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: none !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-card-inner,
        .gacha-overlay.phase-special_tension .gacha-card-inner {
          transform: rotateY(0deg) !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-inner,
        .gacha-overlay.revealed .gacha-card-inner {
          transform: rotateY(180deg) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translate3d(0, 58px, 0) scale(.72) !important;
          transition:
            opacity .22s ease,
            transform .32s cubic-bezier(.22,.82,.22,1),
            filter .22s ease,
            visibility 0s linear .22s !important;
        }

        @keyframes klolNoOverlapPulledCardOnly {
          0% {
            opacity: 1;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          20% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .96), calc(var(--y) - 84px), 0)
              rotate(calc(var(--r) * .70))
              scale(.96);
          }

          40% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .92), calc(var(--y) - 92px), 0)
              rotate(calc(var(--r) * .55))
              scale(1.04);
          }

          62% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .36), -58px, 0)
              rotate(calc(var(--r) * .22))
              scale(1.42);
          }

          82% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .06), -10px, 0)
              rotate(calc(var(--r) * .05))
              scale(1.72);
          }

          92% {
            opacity: 1;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(1.82);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(1.82);
          }
        }

        @keyframes klolNoOverlapRestCardsGather {
          0% {
            opacity: .94;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          30% {
            opacity: .9;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.76);
          }

          66% {
            opacity: .54;
            transform:
              translate3d(calc(var(--x) * .42), calc(var(--y) + 18px), 0)
              rotate(calc(var(--r) * .38))
              scale(.62);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 58px, 0)
              rotate(0deg)
              scale(.46);
          }
        }

        /* K-LOL.GG auction smooth pulled card motion v1
           Fix:
           - selected card movement felt stepped / stiff
           - this uses one continuous curve with softer scale and slower timing
           - the big card remains hidden during SELECTING to prevent overlap
        */

        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 0 !important;
          visibility: hidden !important;
          animation: none !important;
          pointer-events: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolSmoothRestCardsGather 1.52s cubic-bezier(.18,.72,.18,1) both !important;
          animation-delay: 420ms !important;
          transform-origin: center center !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 140 !important;
          opacity: 1 !important;
          visibility: visible !important;
          filter: brightness(1.2) saturate(1.14) !important;
          animation: klolSmoothPulledCardMove 1.88s cubic-bezier(.14,.78,.16,1) both !important;
          animation-delay: 0ms !important;
          transform-origin: center center !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          will-change: transform, opacity, filter !important;
          box-shadow:
            0 30px 76px rgba(0,0,0,.62),
            0 0 44px rgba(96,165,250,.42) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: klolSmoothBigCardEnter .36s cubic-bezier(.2,.82,.22,1) both !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        @keyframes klolSmoothPulledCardMove {
          0% {
            opacity: 1;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          12% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .99), calc(var(--y) - 36px), 0)
              rotate(calc(var(--r) * .86))
              scale(.84);
          }

          25% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .94), calc(var(--y) - 76px), 0)
              rotate(calc(var(--r) * .68))
              scale(.94);
          }

          38% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .82), calc(var(--y) - 96px), 0)
              rotate(calc(var(--r) * .50))
              scale(1.02);
          }

          52% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .58), -82px, 0)
              rotate(calc(var(--r) * .34))
              scale(1.16);
          }

          66% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .34), -58px, 0)
              rotate(calc(var(--r) * .20))
              scale(1.34);
          }

          78% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .16), -28px, 0)
              rotate(calc(var(--r) * .10))
              scale(1.54);
          }

          88% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .04), -8px, 0)
              rotate(calc(var(--r) * .03))
              scale(1.70);
          }

          96% {
            opacity: .74;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(1.82);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(1.82);
          }
        }

        @keyframes klolSmoothRestCardsGather {
          0% {
            opacity: .94;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          26% {
            opacity: .9;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.76);
          }

          54% {
            opacity: .64;
            transform:
              translate3d(calc(var(--x) * .58), calc(var(--y) + 10px), 0)
              rotate(calc(var(--r) * .52))
              scale(.66);
          }

          78% {
            opacity: .32;
            transform:
              translate3d(calc(var(--x) * .24), calc(var(--y) + 34px), 0)
              rotate(calc(var(--r) * .22))
              scale(.55);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 62px, 0)
              rotate(0deg)
              scale(.46);
          }
        }

        @keyframes klolSmoothBigCardEnter {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(.96) rotate(0deg);
          }

          72% {
            opacity: .88;
            transform: translate3d(0, 0, 0) scale(1.008) rotate(0deg);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        /* K-LOL.GG auction smooth real draw handoff final v1
           Video analysis fix:
           - previous motion looked stiff because the pulled small card and big picked card were separate elements
           - small card now moves above the fan, pauses briefly, then grows to the exact big-card size
           - big card fades in underneath only at the final matching position
           - this removes the "big card suddenly appears" feeling
        */

        .gacha-overlay.phase-selecting .gacha-deck-cluster {
          z-index: 8 !important;
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-shell {
          z-index: 6 !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          animation: klolSmoothBigCardUnderHandoff 2.04s cubic-bezier(.18,.82,.18,1) both !important;
          transform-origin: center center !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
          pointer-events: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolSmoothRestCardsGatherAfterPull 1.62s cubic-bezier(.2,.76,.18,1) both !important;
          animation-delay: 460ms !important;
          transform-origin: center center !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 180 !important;
          opacity: 1 !important;
          visibility: visible !important;
          filter: brightness(1.22) saturate(1.16) !important;
          animation: klolSmoothActualPulledCardToBigSize 2.04s cubic-bezier(.13,.78,.15,1) both !important;
          animation-delay: 0ms !important;
          transform-origin: center center !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          will-change: transform, opacity, filter !important;
          box-shadow:
            0 34px 88px rgba(0,0,0,.68),
            0 0 54px rgba(96,165,250,.48) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card,
        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: none !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-card-inner,
        .gacha-overlay.phase-special_tension .gacha-card-inner {
          transform: rotateY(0deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-inner,
        .gacha-overlay.revealed .gacha-card-inner {
          transform: rotateY(180deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translate3d(0, 58px, 0) scale(.72) !important;
          transition:
            opacity .22s ease,
            transform .32s cubic-bezier(.22,.82,.22,1),
            filter .22s ease,
            visibility 0s linear .22s !important;
        }

        @keyframes klolSmoothActualPulledCardToBigSize {
          0% {
            opacity: 1;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          10% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .99), calc(var(--y) - 34px), 0)
              rotate(calc(var(--r) * .86))
              scale(.84);
          }

          22% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .94), calc(var(--y) - 78px), 0)
              rotate(calc(var(--r) * .68))
              scale(.95);
          }

          /* 뽑힌 카드가 위에서 잠깐 보이는 구간 */
          36% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .86), calc(var(--y) - 96px), 0)
              rotate(calc(var(--r) * .52))
              scale(1.02);
          }

          48% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .68), -88px, 0)
              rotate(calc(var(--r) * .38))
              scale(1.18);
          }

          62% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .42), -62px, 0)
              rotate(calc(var(--r) * .24))
              scale(1.52);
          }

          74% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .22), -36px, 0)
              rotate(calc(var(--r) * .13))
              scale(1.92);
          }

          84% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .08), -12px, 0)
              rotate(calc(var(--r) * .05))
              scale(2.36);
          }

          /* 작은 카드의 최종 크기를 큰 카드와 거의 맞춤 */
          94% {
            opacity: 1;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(2.74);
          }

          99% {
            opacity: .18;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(2.74);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(2.74);
          }
        }

        @keyframes klolSmoothBigCardUnderHandoff {
          0%, 88% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }

          94% {
            opacity: .24;
            transform: translate3d(0, 0, 0) scale(1.002) rotate(0deg);
          }

          98% {
            opacity: .82;
            transform: translate3d(0, 0, 0) scale(1.001) rotate(0deg);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        @keyframes klolSmoothRestCardsGatherAfterPull {
          0% {
            opacity: .94;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          26% {
            opacity: .9;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.76);
          }

          54% {
            opacity: .62;
            transform:
              translate3d(calc(var(--x) * .58), calc(var(--y) + 10px), 0)
              rotate(calc(var(--r) * .52))
              scale(.66);
          }

          78% {
            opacity: .3;
            transform:
              translate3d(calc(var(--x) * .24), calc(var(--y) + 34px), 0)
              rotate(calc(var(--r) * .22))
              scale(.55);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 62px, 0)
              rotate(0deg)
              scale(.46);
          }
        }

        /* K-LOL.GG auction one-piece smooth draw motion v1
           Video-based fix:
           - big card was visible while the small selected card was being pulled
           - selected card motion looked segmented because scale/position hand-off happened too early
           - SELECTING now shows only the selected small card
           - the selected card moves in one continuous path and grows to the center
           - big card appears only after SELECTING ends
        */

        .gacha-card-back {
          background-image:
            url("/auction-cards/back-premium.svg"),
            linear-gradient(145deg, #60a5fa 0%, #1d4ed8 48%, #020817 100%) !important;
          background-size: 100% 100%, cover !important;
          background-position: center, center !important;
          background-repeat: no-repeat, no-repeat !important;
          opacity: 1 !important;
          filter: brightness(1.12) saturate(1.08) !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          transform-style: preserve-3d !important;
          will-change: transform, opacity, filter !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after {
          content: none !important;
          display: none !important;
        }

        /* SELECTING 중에는 큰 카드가 절대 보이면 안 됨 */
        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 0 !important;
          visibility: hidden !important;
          display: block !important;
          animation: none !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          pointer-events: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-shell {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        /* 나머지 카드들은 선택 카드가 빠져나온 뒤 천천히 모여 사라짐 */
        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolOnePieceRestCardsGather 1.72s cubic-bezier(.18,.72,.18,1) both !important;
          animation-delay: 520ms !important;
          transform-origin: center center !important;
          will-change: transform, opacity, filter !important;
        }

        /* 선택된 한 장만 실제로 뽑히는 카드처럼 이동 */
        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          z-index: 220 !important;
          opacity: 1 !important;
          visibility: visible !important;
          filter: brightness(1.22) saturate(1.16) !important;
          animation: klolOnePiecePulledCardMove 2.22s cubic-bezier(.12,.76,.12,1) both !important;
          animation-delay: 0ms !important;
          transform-origin: center center !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          will-change: transform, opacity, filter !important;
          box-shadow:
            0 34px 88px rgba(0,0,0,.68),
            0 0 54px rgba(96,165,250,.48) !important;
        }

        /* 큰 카드는 SELECTING이 끝난 뒤 티어 확인 단계에서만 등장 */
        .gacha-overlay.phase-tier_ascending .gacha-picked-shell,
        .gacha-overlay.phase-special_tension .gacha-picked-shell,
        .gacha-overlay.phase-flipping .gacha-picked-shell,
        .gacha-overlay.revealed .gacha-picked-shell {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: klolOnePieceBigCardEnter .42s cubic-bezier(.22,.82,.22,1) both !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
          animation: none !important;
          filter: drop-shadow(0 24px 56px rgba(0,0,0,.50)) !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-card-inner,
        .gacha-overlay.phase-special_tension .gacha-card-inner {
          transform: rotateY(0deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.phase-flipping .gacha-card-inner,
        .gacha-overlay.revealed .gacha-card-inner {
          transform: rotateY(180deg) !important;
          backface-visibility: visible !important;
          -webkit-backface-visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-deck-cluster,
        .gacha-overlay.phase-special_tension .gacha-deck-cluster,
        .gacha-overlay.phase-flipping .gacha-deck-cluster,
        .gacha-overlay.revealed .gacha-deck-cluster {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          filter: blur(8px) !important;
          transform: translate3d(0, 58px, 0) scale(.72) !important;
        }

        @keyframes klolOnePiecePulledCardMove {
          0% {
            opacity: 1;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          14% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .98), calc(var(--y) - 50px), 0)
              rotate(calc(var(--r) * .82))
              scale(.88);
          }

          28% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .90), calc(var(--y) - 96px), 0)
              rotate(calc(var(--r) * .62))
              scale(1.02);
          }

          42% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .74), -102px, 0)
              rotate(calc(var(--r) * .46))
              scale(1.16);
          }

          56% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .50), -78px, 0)
              rotate(calc(var(--r) * .30))
              scale(1.36);
          }

          70% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .28), -48px, 0)
              rotate(calc(var(--r) * .17))
              scale(1.58);
          }

          82% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .12), -20px, 0)
              rotate(calc(var(--r) * .07))
              scale(1.76);
          }

          92% {
            opacity: 1;
            transform:
              translate3d(calc(var(--x) * .02), -4px, 0)
              rotate(calc(var(--r) * .02))
              scale(1.90);
          }

          98% {
            opacity: .82;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(1.96);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 0, 0)
              rotate(0deg)
              scale(1.96);
          }
        }

        @keyframes klolOnePieceRestCardsGather {
          0% {
            opacity: .94;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.78);
          }

          32% {
            opacity: .9;
            transform:
              translate3d(var(--x), var(--y), 0)
              rotate(var(--r))
              scale(.76);
          }

          58% {
            opacity: .62;
            transform:
              translate3d(calc(var(--x) * .58), calc(var(--y) + 12px), 0)
              rotate(calc(var(--r) * .52))
              scale(.66);
          }

          82% {
            opacity: .30;
            transform:
              translate3d(calc(var(--x) * .24), calc(var(--y) + 36px), 0)
              rotate(calc(var(--r) * .22))
              scale(.55);
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 64px, 0)
              rotate(0deg)
              scale(.46);
          }
        }

        @keyframes klolOnePieceBigCardEnter {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(.985) rotate(0deg);
          }

          68% {
            opacity: .86;
            transform: translate3d(0, 0, 0) scale(1.006) rotate(0deg);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          }
        }

        /* K-LOL.GG auction bridge draw motion only v1
           Scope:
           - 기존 빛/링/충격파/티어 효과는 유지
           - SELECTING 단계의 카드 뽑힘 모션만 브릿지 카드로 처리
           - 큰 카드가 뽑히는 중에 보이는 문제 방지
           - 원본 선택 카드와 브릿지 카드 중복 방지
        */

        .gacha-overlay.draw-card-1 { --bridge-x: -246px; --bridge-y: 34px; --bridge-r: -16deg; }
        .gacha-overlay.draw-card-2 { --bridge-x: -184px; --bridge-y: 17px; --bridge-r: -12deg; }
        .gacha-overlay.draw-card-3 { --bridge-x: -123px; --bridge-y: 5px; --bridge-r: -8deg; }
        .gacha-overlay.draw-card-4 { --bridge-x: -62px; --bridge-y: -3px; --bridge-r: -4deg; }
        .gacha-overlay.draw-card-5 { --bridge-x: 0px; --bridge-y: -6px; --bridge-r: 0deg; }
        .gacha-overlay.draw-card-6 { --bridge-x: 62px; --bridge-y: -3px; --bridge-r: 4deg; }
        .gacha-overlay.draw-card-7 { --bridge-x: 123px; --bridge-y: 5px; --bridge-r: 8deg; }
        .gacha-overlay.draw-card-8 { --bridge-x: 184px; --bridge-y: 17px; --bridge-r: 12deg; }
        .gacha-overlay.draw-card-9 { --bridge-x: 246px; --bridge-y: 34px; --bridge-r: 16deg; }

        .gacha-draw-bridge {
          position: absolute;
          left: calc(50% - 76px);
          top: calc(50% - 108px);
          width: 152px;
          height: 216px;
          z-index: 260;
          pointer-events: none;
          transform: translateZ(0);
          will-change: transform, opacity;
        }

        .gacha-draw-bridge-x,
        .gacha-draw-bridge-y {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          will-change: transform, opacity;
        }

        .gacha-draw-bridge-x {
          transform: translate3d(var(--bridge-x), 0, 0);
          animation: klolBridgeDrawX 2.08s cubic-bezier(.12,.76,.12,1) both;
        }

        .gacha-draw-bridge-y {
          transform: translate3d(0, var(--bridge-y), 0) rotate(var(--bridge-r)) scale(.94);
          animation: klolBridgeDrawY 2.08s cubic-bezier(.12,.76,.12,1) both;
        }

        .gacha-draw-bridge-img {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 16px;
          object-fit: cover;
          box-shadow:
            0 34px 88px rgba(0,0,0,.68),
            0 0 54px rgba(96,165,250,.48);
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        /* SELECTING 중 큰 카드는 절대 보이지 않게 처리 */
        .gacha-overlay.phase-selecting .gacha-picked-shell,
        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          animation: none !important;
        }

        /* 선택된 원본 카드 1장은 숨기고, 같은 위치의 브릿지 카드가 대신 움직임 */
        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          opacity: 0 !important;
          visibility: hidden !important;
          animation: none !important;
        }

        /* 나머지 카드만 뒤로 모여서 사라짐 */
        .gacha-overlay.phase-selecting .gacha-card-back {
          animation: klolBridgeRestCardsGather 1.48s cubic-bezier(.18,.72,.18,1) both !important;
          animation-delay: .46s !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-shell,
        .gacha-overlay.phase-special_tension .gacha-picked-shell,
        .gacha-overlay.phase-flipping .gacha-picked-shell,
        .gacha-overlay.revealed .gacha-picked-shell {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
          animation: klolBridgeBigCardEnter .28s cubic-bezier(.22,.82,.22,1) both !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
        }

        @keyframes klolBridgeDrawX {
          0% {
            transform: translate3d(var(--bridge-x), 0, 0);
          }

          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes klolBridgeDrawY {
          0% {
            opacity: 1;
            transform: translate3d(0, var(--bridge-y), 0) rotate(var(--bridge-r)) scale(.94);
          }

          24% {
            opacity: 1;
            transform: translate3d(0, calc(var(--bridge-y) - 92px), 0) rotate(calc(var(--bridge-r) * .62)) scale(1.04);
          }

          54% {
            opacity: 1;
            transform: translate3d(0, -78px, 0) rotate(calc(var(--bridge-r) * .26)) scale(1.34);
          }

          78% {
            opacity: 1;
            transform: translate3d(0, -26px, 0) rotate(calc(var(--bridge-r) * .08)) scale(1.68);
          }

          94% {
            opacity: 1;
            transform: translate3d(0, -4px, 0) rotate(0deg) scale(1.86);
          }

          100% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1.90);
          }
        }

        @keyframes klolBridgeRestCardsGather {
          0% {
            opacity: .94;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.78);
          }

          45% {
            opacity: .68;
            transform: translate3d(calc(var(--x) * .54), calc(var(--y) + 14px), 0) rotate(calc(var(--r) * .46)) scale(.66);
          }

          100% {
            opacity: 0;
            transform: translate3d(0, 62px, 0) rotate(0deg) scale(.48);
          }
        }

        @keyframes klolBridgeBigCardEnter {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(.99);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        /* K-LOL.GG auction true FLIP draw motion v1
           Real FLIP:
           - selected deck card rect is measured with getBoundingClientRect()
           - bridge card is positioned with local gacha-showcase-stage coordinates
           - Web Animations API moves it to the measured picked-card center
           - original light/ring/shockwave/tier effects are preserved
        */

        .gacha-flip-bridge-card {
          position: absolute;
          z-index: 999999;
          pointer-events: none;
          transform-origin: center center;
          will-change: transform, opacity;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform-style: preserve-3d;
        }

        .gacha-flip-bridge-card-img {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 16px;
          object-fit: contain;
          box-shadow:
            0 30px 78px rgba(0,0,0,.64),
            0 0 46px rgba(96,165,250,.42);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translateZ(0);
        }

        .gacha-overlay.phase-selecting .gacha-picked-shell,
        .gacha-overlay.phase-selecting .gacha-picked-card {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          animation: none !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          opacity: 0 !important;
          visibility: hidden !important;
          animation: none !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-shell,
        .gacha-overlay.phase-special_tension .gacha-picked-shell,
        .gacha-overlay.phase-flipping .gacha-picked-shell,
        .gacha-overlay.revealed .gacha-picked-shell {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
          animation: klolFlipBigCardEnter .24s cubic-bezier(.22,.82,.22,1) both !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
        }

        .gacha-overlay.phase-special_tension .gacha-picked-card,
        .gacha-overlay.phase-flipping .gacha-picked-card,
        .gacha-overlay.revealed .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
        }

        .gacha-card-back::before,
        .gacha-card-back::after,
        .gacha-card-face.back::before,
        .gacha-card-face.back::after,
        .gacha-card-face.back.auction-svg-card-back::before,
        .gacha-card-face.back.auction-svg-card-back::after {
          content: none !important;
          display: none !important;
        }

        .gacha-card-face.back.auction-svg-card-back {
          background: transparent !important;
          background-image: none !important;
        }

        .auction-svg-tier-emblem {
          top: 24.8% !important;
        }

        @media (max-height: 780px) {
          .auction-svg-tier-emblem {
            top: 24.3% !important;
          }
        }



        /* K-LOL.GG final guard: SELECTING uses only the measured FLIP bridge card.
           This prevents the old CSS bridge / picked-card shell from drawing a second card. */
        .gacha-overlay.phase-selecting .gacha-draw-bridge {
          display: none !important;
        }

        .gacha-overlay.phase-selecting .gacha-picked-shell,
        .gacha-overlay.phase-selecting .gacha-picked-card,
        .gacha-overlay.phase-selecting .gacha-picked-path {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          animation: none !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          opacity: 0 !important;
          visibility: hidden !important;
          animation: none !important;
        }

        @keyframes klolFlipBigCardEnter {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(.985);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        /* K-LOL.GG auction smooth handoff v2
           The measured bridge card now grows to the same visual size as the picked card.
           During the first TIER_ASCENDING paint, the big card is already fixed in place
           behind the bridge, so removing the bridge does not create a pop or size jump. */
        .gacha-overlay.phase-tier_ascending .gacha-picked-shell,
        .gacha-overlay.phase-tier_ascending .gacha-picked-path,
        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-path,
        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          animation: none !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
        }

        /* K-LOL.GG auction anchored draw patch v1
           The drawn bridge card is now positioned in gacha-showcase-stage local coordinates,
           so it starts exactly from the selected card in the spread instead of being offset/clipped
           by transformed overlay ancestors. */
        .gacha-showcase,
        .gacha-showcase-stage {
          overflow: visible !important;
        }

        .gacha-flip-bridge-card {
          position: absolute !important;
          z-index: 999999 !important;
          overflow: visible !important;
          transform-origin: center center !important;
          contain: none !important;
        }

        .gacha-flip-bridge-card-img {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          overflow: visible !important;
        }

        /* K-LOL.GG auction natural draw handoff v3
           Natural sequence:
           1) after fan-out, selected card remains visible inside the spread for a short lock-on beat
           2) only after the measured bridge card is mounted, the original selected card is hidden
           3) the bridge starts at the same visual scale as the spread card and then grows to the picked card
        */
        .gacha-overlay.phase-selecting:not(.bridge-active) .gacha-deck-cluster {
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          animation: none !important;
          filter: none !important;
        }

        .gacha-overlay.phase-selecting:not(.bridge-active) .gacha-card-back {
          opacity: .96 !important;
          visibility: visible !important;
          animation: none !important;
          transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.94) !important;
          transform-origin: center center !important;
          filter: brightness(.98) saturate(1.02) !important;
        }

        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting:not(.bridge-active).draw-card-9 .gacha-card-back.card-9 {
          z-index: 160 !important;
          opacity: 1 !important;
          visibility: visible !important;
          animation: klolNaturalSelectedLock .36s cubic-bezier(.2,.82,.2,1) both !important;
          filter:
            brightness(1.24)
            saturate(1.18)
            drop-shadow(0 0 18px rgba(125,211,252,.42)) !important;
        }

        .gacha-overlay.phase-selecting.bridge-active .gacha-deck-cluster {
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          animation: none !important;
        }

        .gacha-overlay.phase-selecting.bridge-active .gacha-card-back {
          opacity: .90 !important;
          visibility: visible !important;
          animation: klolNaturalRestCardsGather 1.34s cubic-bezier(.18,.72,.18,1) both !important;
          animation-delay: .16s !important;
          transform-origin: center center !important;
          filter: brightness(.92) saturate(.96) !important;
        }

        .gacha-overlay.phase-selecting.bridge-active.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.bridge-active.draw-card-9 .gacha-card-back.card-9 {
          opacity: 0 !important;
          visibility: hidden !important;
          animation: none !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-shell,
        .gacha-overlay.phase-tier_ascending .gacha-picked-path,
        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .gacha-overlay.phase-tier_ascending .gacha-picked-path,
        .gacha-overlay.phase-tier_ascending .gacha-picked-card {
          animation: none !important;
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg) !important;
        }

        @keyframes klolNaturalSelectedLock {
          0% {
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.94);
          }

          100% {
            transform: translate3d(var(--x), calc(var(--y) - 14px), 0) rotate(calc(var(--r) * .96)) scale(.99);
          }
        }

        @keyframes klolNaturalRestCardsGather {
          0% {
            opacity: .92;
            transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)) scale(.94);
          }

          42% {
            opacity: .72;
            transform: translate3d(calc(var(--x) * .64), calc(var(--y) + 12px), 0) rotate(calc(var(--r) * .58)) scale(.78);
          }

          100% {
            opacity: 0;
            transform: translate3d(0, 58px, 0) rotate(0deg) scale(.50);
          }
        }

        /* K-LOL.GG auction stage draw art v1
           Uses the generated stage image as the actual draw scene while keeping the existing
           card refs and draw logic intact. */
        .gacha-overlay {
          --klol-auction-stage-draw-bg: url("/images/generated/klol-auction-stage-draw-cards.png");
        }

        .gacha-overlay .gacha-overlay-card {
          background:
            radial-gradient(circle at 50% 38%, rgba(74, 163, 255, 0.16), transparent 42%),
            linear-gradient(180deg, rgba(1, 5, 14, 0.72), rgba(1, 5, 14, 0.94)) !important;
        }

        .gacha-overlay .gacha-showcase {
          overflow: hidden !important;
          min-height: min(74vh, 800px) !important;
          border: 1px solid rgba(125, 211, 252, 0.26) !important;
          border-radius: 30px !important;
          background:
            radial-gradient(circle at 50% 50%, rgba(125, 211, 252, 0.10), transparent 36%),
            linear-gradient(180deg, rgba(0, 5, 14, 0.02), rgba(0, 5, 14, 0.28) 56%, rgba(0, 5, 14, 0.62) 100%),
            linear-gradient(90deg, rgba(1, 5, 14, 0.28), transparent 22%, transparent 78%, rgba(1, 5, 14, 0.28)),
            var(--klol-auction-stage-draw-bg) center center / cover no-repeat !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -70px 120px rgba(0, 0, 0, 0.42),
            0 28px 90px rgba(0, 0, 0, 0.52) !important;
        }

        .gacha-overlay .gacha-showcase-stage {
          width: min(100%, 1180px) !important;
          min-height: min(66vh, 700px) !important;
          overflow: visible !important;
        }

        .gacha-overlay.phase-shuffling .gacha-deck-cluster,
        .gacha-overlay.phase-selecting .gacha-deck-cluster {
          left: 50% !important;
          top: 65% !important;
          width: min(500px, 58vw) !important;
          height: 220px !important;
          margin-left: max(-250px, -29vw) !important;
          margin-top: -110px !important;
        }

        .gacha-overlay.phase-shuffling .gacha-card-back,
        .gacha-overlay.phase-selecting .gacha-card-back {
          left: calc(50% - 58px) !important;
          top: calc(50% - 81px) !important;
          width: 116px !important;
          height: 162px !important;
        }

        .gacha-overlay .gacha-card-back.card-1 {
          --x: -148px !important;
          --y: 18px !important;
          --r: -10deg !important;
        }

        .gacha-overlay .gacha-card-back.card-2 {
          --x: -74px !important;
          --y: 4px !important;
          --r: -5deg !important;
        }

        .gacha-overlay .gacha-card-back.card-3 {
          --x: 0px !important;
          --y: -2px !important;
          --r: 0deg !important;
        }

        .gacha-overlay .gacha-card-back.card-4 {
          --x: 74px !important;
          --y: 4px !important;
          --r: 5deg !important;
        }

        .gacha-overlay .gacha-card-back.card-5 {
          --x: 148px !important;
          --y: 18px !important;
          --r: 10deg !important;
        }

        .gacha-overlay.phase-shuffling .gacha-card-back,
        .gacha-overlay.phase-selecting .gacha-card-back {
          filter:
            brightness(1.08)
            saturate(1.08)
            drop-shadow(0 18px 24px rgba(0, 0, 0, 0.62))
            drop-shadow(0 0 22px rgba(125, 211, 252, 0.28)) !important;
        }

        .gacha-overlay.phase-selecting.draw-card-1 .gacha-card-back.card-1,
        .gacha-overlay.phase-selecting.draw-card-2 .gacha-card-back.card-2,
        .gacha-overlay.phase-selecting.draw-card-3 .gacha-card-back.card-3,
        .gacha-overlay.phase-selecting.draw-card-4 .gacha-card-back.card-4,
        .gacha-overlay.phase-selecting.draw-card-5 .gacha-card-back.card-5,
        .gacha-overlay.phase-selecting.draw-card-6 .gacha-card-back.card-6,
        .gacha-overlay.phase-selecting.draw-card-7 .gacha-card-back.card-7,
        .gacha-overlay.phase-selecting.draw-card-8 .gacha-card-back.card-8,
        .gacha-overlay.phase-selecting.draw-card-9 .gacha-card-back.card-9 {
          filter:
            brightness(1.28)
            saturate(1.18)
            drop-shadow(0 26px 38px rgba(0, 0, 0, 0.7))
            drop-shadow(0 0 38px rgba(125, 211, 252, 0.5)) !important;
        }

        @media (max-width: 900px) {
          .gacha-overlay .gacha-showcase {
            min-height: 520px !important;
            background-position: center bottom !important;
          }

          .gacha-overlay.phase-shuffling .gacha-deck-cluster,
          .gacha-overlay.phase-selecting .gacha-deck-cluster {
            top: 62% !important;
            width: min(420px, 88vw) !important;
            margin-left: max(-210px, -44vw) !important;
            transform: scale(.82) !important;
          }

          .gacha-overlay.phase-shuffling .gacha-card-back,
          .gacha-overlay.phase-selecting .gacha-card-back {
            left: calc(50% - 46px) !important;
            top: calc(50% - 64px) !important;
            width: 92px !important;
            height: 128px !important;
          }

          .gacha-overlay .gacha-card-back.card-1 { --x: -116px !important; --y: 16px !important; }
          .gacha-overlay .gacha-card-back.card-2 { --x: -58px !important; --y: 5px !important; }
          .gacha-overlay .gacha-card-back.card-4 { --x: 58px !important; --y: 5px !important; }
          .gacha-overlay .gacha-card-back.card-5 { --x: 116px !important; --y: 16px !important; }
        }
`}</style>

      <div className="destruction-auction-summary">
        <div className="admin-event-detail-card">
          <span>미추첨</span>
          <strong>{pendingCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>현재 추첨</span>
          <strong>{drawnCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>보류</span>
          <strong>{holdCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>낙찰</span>
          <strong>
            {soldCount} / {totalAuctionTargets}명
          </strong>
        </div>
        <div className="admin-event-detail-card">
          <span>현재 풀</span>
          <strong>{auctionTargetPoolLabel}</strong>
        </div>
      </div>

      <div className="destruction-auction-layout">
        <section className="destruction-team-matrix">
          <div className="destruction-team-matrix-grid">
            <div className="matrix-cell matrix-header matrix-team-header">
              팀
            </div>
            {POSITIONS.map((position) => (
              <div
                key={`header-${position}`}
                className="matrix-cell matrix-header matrix-position"
              >
                {position}
              </div>
            ))}

            {teams.map((team) => (
              <Fragment key={team.id}>
                <div className="matrix-cell matrix-team-name">
                  <strong>{team.name}</strong>
                  <span className="matrix-team-point">
                    잔여 {team.remainingAuctionPoints}P
                  </span>
                </div>
                {POSITIONS.map((position) => {
                  const status = getTeamPositionStatus(team, position);
                  return (
                    <div key={`${team.id}-${position}`} className="matrix-cell">
                      {status.filled ? (
                        <div
                          className={
                            status.isCaptain
                              ? "matrix-filled is-captain"
                              : "matrix-filled"
                          }
                        >
                          <div className="matrix-player-name">
                            {status.label}
                          </div>
                          {status.subLabel ? (
                            <div className="matrix-player-sub">
                              {status.subLabel}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="matrix-empty">대기</div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </section>

        <section className="destruction-auction-right">
          <div className="auction-control-panel">
            <div className="admin-page__header">
              <div>
                <h3 className="admin-event-section-title">
                  랜덤 플레이어 추첨
                </h3>
              </div>
            </div>
            <div className="auction-mini-stage">
              <div className="auction-mini-center">
                {currentTarget ? (
                  <div className="auction-current-preview">
                    <div className="auction-front-header">
                      <div>
                        <div className="auction-front-name">
                          {getDisplayName(currentTarget)}
                        </div>
                        <div className="auction-front-sub">
                          {getDisplayNickname(currentTarget)}
                        </div>
                      </div>
                      <span
                        className="auction-position-badge"
                        style={{
                          background: getPositionTheme(currentTarget.position)
                            .badge,
                        }}
                      >
                        {getPositionLabel(currentTarget.position)}
                      </span>
                    </div>
                    <div className="auction-front-grid">
                      <StatTile
                        label="현재티어"
                        value={currentTarget.player.currentTier ?? "-"}
                      />
                      <StatTile
                        label="최고티어"
                        value={currentTarget.player.peakTier ?? "-"}
                      />
                      <StatTile
                        label="부라인"
                        value={currentTarget.subPositions?.length ? currentTarget.subPositions.join(" / ") : "-"}
                      />
                    </div>
                    <div className="auction-message-box">
                      <strong>각오</strong>
                      {currentTarget.message ? currentTarget.message : <span>입력된 각오가 없습니다.</span>}
                    </div>
                  </div>
                ) : (
                  renderMiniCardStack()
                )}
              </div>
            </div>
            <div className="auction-stage-button-row">
              {!currentTarget ? (
                <div
                  className={
                    liveMode
                      ? "auction-card-action-grid is-single"
                      : "auction-card-action-grid"
                  }
                >
                  <button
                    type="button"
                    className="admin-page__create-button auction-card-view-button"
                    onClick={handleDraw}
                    disabled={drawableDisabled}
                  >
                    {isDrawing ? "플레이어 추첨 중..." : "플레이어 추첨"}
                  </button>
                  {!liveMode ? (
                    <>
                      <button
                        type="button"
                        className="auction-preview-fullscreen-button"
                        onClick={openPreviewFullscreen}
                        disabled={isDrawing}
                      >
                        운영 확대
                      </button>
                      <button
                        type="button"
                        className="auction-preview-fullscreen-button"
                        onClick={openLiveAuctionScreen}
                        disabled={isDrawing}
                      >
                        경매 전용 화면
                      </button>
                    </>
                  ) : null}
                </div>
              ) : (
                <div
                  className={
                    liveMode
                      ? "auction-card-action-grid is-single"
                      : "auction-card-action-grid"
                  }
                >
                  <button
                    type="button"
                    className="admin-page__create-button auction-card-view-button"
                    onClick={openOverlayForCurrent}
                    disabled={isDrawing}
                  >
                    플레이어 보기
                  </button>
                  {!liveMode ? (
                    <>
                      <button
                        type="button"
                        className="auction-preview-fullscreen-button"
                        onClick={openPreviewFullscreen}
                        disabled={isDrawing}
                      >
                        운영 확대
                      </button>
                      <button
                        type="button"
                        className="auction-preview-fullscreen-button"
                        onClick={openLiveAuctionScreen}
                        disabled={isDrawing}
                      >
                        경매 전용 화면
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
            {error ? <p className="notice-form__error">{error}</p> : null}
          </div>
        </section>
      </div>

      {isOverlayOpen
        ? createPortal(
            <div
              className={`gacha-overlay ${overlayTierClassName} ${overlayAscentClass} phase-${drawPhase.toLowerCase()} ${overlayHighTierClass} ${overlayBridgeClass} ${drawCardClassName} ${isShuffleAnimationPhase ? "animating" : ""} ${drawPhase === "REVEALED" ? "revealed" : ""}`}
            >
              <div className="gacha-overlay-card">
                <button
                  type="button"
                  className="gacha-close"
                  onClick={closeOverlay}
                  aria-label="닫기"
                >
                  ×
                </button>
                <div className="gacha-layout">
                  <section className="gacha-showcase">
                    <div ref={showcaseStageRef} className="gacha-showcase-stage">
                      <div className="gacha-speedlines" />
                      <div className="gacha-light-burst" />
                      <div className="gacha-ring" />
                      <div className="gacha-shockwave" />
                      <div className="gacha-sparkles" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      {flipBridge ? (
                        <div
                          ref={flipBridgeRef}
                          className="gacha-flip-bridge-card"
                          style={{
                            left: flipBridge.left,
                            top: flipBridge.top,
                            width: flipBridge.width,
                            height: flipBridge.height,
                            transform: `rotate(${flipBridge.rotation}deg) scale(${flipBridge.startScale})`,
                          }}
                          aria-hidden="true"
                        >
                          <Image
                            className="gacha-flip-bridge-card-img"
                            src="/auction-cards/back-premium.svg"
                            alt=""
                            aria-hidden="true"
                            width={180}
                            height={252}
                          />
                        </div>
                      ) : null}
                      {drawPhase === "SHUFFLING" ||
                      drawPhase === "SELECTING" ? (
                        <div className="gacha-deck-cluster" aria-hidden="true">
                          {Array.from({ length: 5 }, (_, index) => (
                            <div
                              key={`draw-card-${index + 1}`}
                              ref={(node) => {
                                deckCardRefs.current[index] = node;
                              }}
                              className={`gacha-card-back card-${index + 1}`}
                            />
                          ))}
                        </div>
                      ) : null}
                      <div ref={pickedShellRef} className="gacha-picked-shell">
                        <div className="gacha-picked-path">
                          <div className="gacha-picked-card">
                            <div className="gacha-card-inner">
                              <div className="gacha-card-face back auction-svg-card-back">
                                <Image
                                  className="auction-svg-card-bg"
                                  src="/auction-cards/back-premium.svg"
                                  alt=""
                                  aria-hidden="true"
                                  width={360}
                                  height={504}
                                />
                              </div>
                              <div className="gacha-card-face front auction-svg-card-front">
                                <Image
                                  className="auction-svg-card-bg"
                                  src={`/auction-cards/front-${tierVisual.key.toLowerCase()}.svg`}
                                  alt=""
                                  aria-hidden="true"
                                  width={360}
                                  height={504}
                                />

                                <div className="auction-svg-card-content">
                                  <div className="auction-svg-player">
                                    <div className="auction-svg-player-name">
                                      {getDisplayName(currentTarget)}
                                    </div>
                                    <div className="auction-svg-player-nick">
                                      {getDisplayNickname(currentTarget)}
                                    </div>
                                  </div>

                                  <div className="auction-svg-tier-emblem">
                                    <Image
                                      className="auction-svg-tier-image"
                                      src={tierImagePath}
                                      alt={
                                        tierReference
                                          ? `${tierReference} 티어`
                                          : "티어"
                                      }
                                      width={128}
                                      height={128}
                                    />
                                  </div>

                                  <div className="auction-svg-stats">
                                    <div className="auction-svg-stat-row">
                                      <span>현재 티어</span>
                                      <strong>
                                        {currentTarget?.player.currentTier ?? "-"}
                                      </strong>
                                    </div>
                                    <div className="auction-svg-stat-row">
                                      <span>최고 티어</span>
                                      <strong>
                                        {currentTarget?.player.peakTier ?? "-"}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="auction-svg-cert-badge">
                                    <span>인증서</span>
                                    <strong>{tierVisual.key}</strong>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="gacha-flip-flash" />
                      </div>
                    </div>
                  </section>

                  <aside className="gacha-panel">
                    <div className="gacha-panel-chip">
                      🎴 멸망전 플레이어 경매
                    </div>
                    <button
                      type="button"
                      className={`gacha-sound-toggle ${soundEnabled ? "is-on" : "is-off"}`}
                      onClick={() => setSoundEnabled((value) => !value)}
                    >
                      효과음 {soundEnabled ? "ON" : "OFF"}
                    </button>
                    <h3 className="gacha-panel-title">{drawPhaseTitle}</h3>
                    <p className="gacha-panel-desc">{drawPhaseDescription}</p>

                    {currentTarget ? (
                      <div className="auction-message-box">
                        <strong>각오</strong>
                        {currentTarget.message ? currentTarget.message : <span>입력된 각오가 없습니다.</span>}
                      </div>
                    ) : null}

                    <div
                      className={`gacha-right-form ${drawPhase === "REVEALED" ? "is-visible" : "is-hidden"}`}
                    >
                      {renderAuctionFields()}
                    </div>

                    <div
                      className="auction-front-grid"
                      style={{ marginTop: 16 }}
                    >
                      <StatTile
                        label="남은 경매"
                        value={`${totalAuctionTargets - soldCount}명`}
                      />
                    </div>
                  </aside>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isPreviewFullscreenOpen
        ? createPortal(
            <div className="auction-fullview-overlay">
              <button
                type="button"
                className="auction-fullview-close"
                onClick={closePreviewFullscreen}
                aria-label="닫기"
              >
                ×
              </button>
              <div className="auction-fullview-panel">
                <div className="auction-fullview-header">
                  <h2 className="auction-fullview-title">
                    3. 경매 진행 · 선택됨
                  </h2>
                  <p className="auction-fullview-desc">
                    사이트에서 플레이어를 추첨한 뒤, 채팅 경매 결과를
                    관리자가 입력합니다.
                  </p>
                </div>

                <div className="destruction-auction-summary">
                  <div className="admin-event-detail-card">
                    <span>미추첨</span>
                    <strong>{pendingCount}명</strong>
                  </div>
                  <div className="admin-event-detail-card">
                    <span>현재 추첨</span>
                    <strong>{drawnCount}명</strong>
                  </div>
                  <div className="admin-event-detail-card">
                    <span>보류</span>
                    <strong>{holdCount}명</strong>
                  </div>
                  <div className="admin-event-detail-card">
                    <span>낙찰</span>
                    <strong>
                      {soldCount} / {totalAuctionTargets}명
                    </strong>
                  </div>
                  <div className="admin-event-detail-card">
                    <span>현재 풀</span>
                    <strong>{auctionTargetPoolLabel}</strong>
                  </div>
                </div>

                <div className="destruction-auction-layout">
                  <section className="destruction-team-matrix">
                    <div className="destruction-team-matrix-grid">
                      <div className="matrix-cell matrix-header matrix-team-header">
                        팀
                      </div>
                      {POSITIONS.map((position) => (
                        <div
                          key={`fullscreen-header-${position}`}
                          className="matrix-cell matrix-header matrix-position"
                        >
                          {position}
                        </div>
                      ))}

                      {teams.map((team) => (
                        <Fragment key={`fullscreen-${team.id}`}>
                          <div className="matrix-cell matrix-team-name">
                            <strong>{team.name}</strong>
                            <span className="matrix-team-point">
                              잔여 {team.remainingAuctionPoints}P
                            </span>
                          </div>
                          {POSITIONS.map((position) => {
                            const status = getTeamPositionStatus(
                              team,
                              position,
                            );
                            return (
                              <div
                                key={`fullscreen-${team.id}-${position}`}
                                className="matrix-cell"
                              >
                                {status.filled ? (
                                  <div
                                    className={
                                      status.isCaptain
                                        ? "matrix-filled is-captain"
                                        : "matrix-filled"
                                    }
                                  >
                                    <div className="matrix-player-name">
                                      {status.label}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="matrix-empty">대기</div>
                                )}
                              </div>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </section>

                  <section className="destruction-auction-right">
                    <div className="auction-control-panel">
                      <div className="admin-page__header">
                        <div>
                          <h3 className="admin-event-section-title">
                            랜덤 플레이어 추첨
                          </h3>
                        </div>
                      </div>
                      <div className="auction-mini-stage">
                        <div className="auction-mini-center">
                          {currentTarget ? (
                            <div className="auction-current-preview">
                              <div className="auction-front-header">
                                <div>
                                  <div className="auction-front-name">
                                    {getDisplayName(currentTarget)}
                                  </div>
                                  <div className="auction-front-sub">
                                    {getDisplayNickname(currentTarget)}
                                  </div>
                                </div>
                                <span
                                  className="auction-position-badge"
                                  style={{
                                    background: getPositionTheme(
                                      currentTarget.position,
                                    ).badge,
                                  }}
                                >
                                  {getPositionLabel(currentTarget.position)}
                                </span>
                              </div>
                              <div className="auction-front-grid">
                                <StatTile
                                  label="현재티어"
                                  value={
                                    currentTarget.player.currentTier ?? "-"
                                  }
                                />
                                <StatTile
                                  label="최고티어"
                                  value={currentTarget.player.peakTier ?? "-"}
                                />
                                <StatTile
                                  label="부라인"
                                  value={currentTarget.subPositions?.length ? currentTarget.subPositions.join(" / ") : "-"}
                                />
                              </div>
                              <div className="auction-message-box">
                                <strong>각오</strong>
                                {currentTarget.message ? currentTarget.message : <span>입력된 각오가 없습니다.</span>}
                              </div>
                            </div>
                          ) : (
                            renderMiniCardStack()
                          )}
                        </div>
                      </div>
                      <div className="auction-stage-button-row">
                        {!currentTarget ? (
                          <button
                            type="button"
                            className="admin-page__create-button"
                            onClick={handleDraw}
                            disabled={drawableDisabled}
                            style={{ width: "100%" }}
                          >
                            {isDrawing
                              ? "플레이어 추첨 중..."
                              : "플레이어 추첨"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-page__create-button auction-card-view-button"
                            onClick={openOverlayForCurrent}
                            disabled={isDrawing}
                            style={{ width: "100%" }}
                          >
                            플레이어 보기
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}













