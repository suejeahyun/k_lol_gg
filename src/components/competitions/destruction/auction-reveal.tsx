"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./auction-reveal.module.css";

export type AuctionRevealCard = Readonly<{
  eventId: string;
  playerName: string;
  positionLabel: string;
  tierLabel: string;
  points: number;
  sold: boolean;
  teamName?: string;
}>;

const sounds = {
  shuffle: "/sounds/auction/auction-shuffle-whoosh.wav",
  flip: "/sounds/auction/auction-card-flip.wav",
  reveal: "/sounds/auction/auction-reveal-impact.wav",
} as const;

/** One shared presentation for every destruction mode and both viewing surfaces. */
export function AuctionReveal({ card }: { card: AuctionRevealCard | null }) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const active = useRef(new Set<AudioBufferSourceNode>());
  const enabled = useRef(false);
  useEffect(() => { const sources = active.current; return () => { for (const source of sources) source.stop(); void audio.current?.close(); }; }, []);

  async function toggleSound() {
    enabled.current = !enabled.current;
    setSoundEnabled(enabled.current);
    if (!enabled.current) { for (const source of active.current) source.stop(); active.current.clear(); return; }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      await Promise.all(Object.entries(sounds).map(async ([key, path]) => {
        if (!buffers.current.has(key)) {
          const response = await fetch(path);
          if (!response.ok) throw new Error("AUDIO_UNAVAILABLE");
          buffers.current.set(key, await audio.current!.decodeAudioData(await response.arrayBuffer()));
        }
      }));
      play("flip");
    } catch { enabled.current = false; setSoundEnabled(false); }
  }
  function play(name: keyof typeof sounds) {
    const context = audio.current;
    const buffer = buffers.current.get(name);
    if (!enabled.current || !context || context.state !== "running" || !buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = 0.22;
    source.buffer = buffer;
    source.connect(gain); gain.connect(context.destination);
    active.current.add(source);
    source.onended = () => { active.current.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }
  return <section className={styles.stage} aria-label="공용 경매 카드 연출">
    <div className={styles.toolbar}><span>DESTRUCTION · AUCTION</span><button type="button" aria-pressed={soundEnabled} onClick={() => void toggleSound()}>효과음 {soundEnabled ? "켜짐" : "켜기"}</button></div>
    {card ? <RevealSequence key={card.eventId} card={card} play={play} /> : <p className={styles.waiting}>다음 선수 카드를 기다리고 있습니다.</p>}
  </section>;
}

function RevealSequence({ card, play }: { card: AuctionRevealCard; play: (name: keyof typeof sounds) => void }) {
  const [phase, setPhase] = useState("shuffle");
  const [points, setPoints] = useState(0);
  const playRef = useRef(play);
  useEffect(() => { playRef.current = play; });
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let frame = 0;
    const finish = () => {
      setPhase("revealed"); playRef.current("reveal");
      if (reduced) { setPoints(card.points); return; }
      const start = performance.now();
      const count = (now: number) => { const progress = Math.min(1, (now - start) / 650); setPoints(Math.round(card.points * progress)); if (progress < 1) frame = requestAnimationFrame(count); };
      frame = requestAnimationFrame(count);
    };
    if (reduced || card.sold) timers.push(setTimeout(finish, 0));
    else {
      playRef.current("shuffle");
      timers.push(setTimeout(() => { setPhase("flip"); playRef.current("flip"); }, 700));
      timers.push(setTimeout(finish, 1450));
    }
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(frame); };
  }, [card.points, card.sold]);
  return <div className={styles.sequence} data-auction-phase={phase}>
    <div className={styles.halo} aria-hidden="true" />
    <div className={styles.card} aria-hidden={phase !== "revealed"}>
      <div className={styles.back} aria-hidden="true"><span>K</span><strong>멸망전</strong><small>WHO IS NEXT?</small></div>
      <div className={styles.front}><small>{card.positionLabel}</small><strong className={styles.name}>{card.playerName}</strong><span>{card.tierLabel}</span><p>{card.sold ? `${card.teamName ?? "팀"} 낙찰` : "최소 입찰 포인트"}</p><strong className={styles.points} data-auction-points={points}>{points.toLocaleString()}<small>P</small></strong></div>
    </div>
    <p className={styles.caption} role="status">{phase === "revealed" ? `${card.playerName} · ${card.sold ? "낙찰" : "최소 입찰"} ${card.points}P` : "선수 카드를 공개합니다…"}</p>
  </div>;
}
