"use client";

import { Clipboard, Coins, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  beginCoinToss,
  INITIAL_COIN_TOSS_STATE,
  revealCoinToss,
  transitionCoinToss,
  type CoinTossState,
} from "@/modules/team-tools";

import styles from "../team-tools.module.css";

const FALLBACK_REVEAL_MS = 2_000;

function browserUint32() {
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0]!;
}

function sideLabel(state: CoinTossState) {
  if (state.phase !== "revealed") return null;
  return state.outcome === "FRONT" ? "앞면" : "뒷면";
}

export function CoinTossTool() {
  const [state, setState] = useState<CoinTossState>(INITIAL_COIN_TOSS_STATE);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    const handleChange = () => {
      update();
      if (query.matches) {
        setState((current) => current.phase === "playing" ? revealCoinToss(current) : current);
      }
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (state.phase !== "playing") return;
    const fallback = window.setTimeout(() => {
      setState((current) => current.phase === "playing" ? revealCoinToss(current) : current);
    }, FALLBACK_REVEAL_MS);
    return () => window.clearTimeout(fallback);
  }, [state.phase, state.round]);

  useEffect(() => {
    if (state.phase !== "playing" || reducedMotion) return;
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    let recoveryTimer: number | null = null;
    try {
      const attempt = video.play();
      if (attempt) {
        void attempt.catch(() => {
          if (active) {
            setState((current) => current.phase === "playing" ? revealCoinToss(current) : current);
          }
        });
      }
    } catch {
      recoveryTimer = window.setTimeout(() => {
        if (active) {
          setState((current) => current.phase === "playing" ? revealCoinToss(current) : current);
        }
      }, 0);
    }
    return () => {
      active = false;
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
    };
  }, [state.phase, state.round, reducedMotion]);

  function reveal() {
    setState((current) => current.phase === "playing" ? revealCoinToss(current) : current);
  }

  function start() {
    if (state.phase === "playing") return;
    setError(null);
    setCopyStatus("");
    try {
      const playing = beginCoinToss(state, browserUint32);
      setState(reducedMotion ? revealCoinToss(playing) : playing);
    } catch {
      setError("코인을 던지지 못했어요. 브라우저를 새로고침한 뒤 다시 시도해 주세요.");
    }
  }

  function reset() {
    setState((current) => transitionCoinToss(current, { type: "RESET" }));
    setError(null);
    setCopyStatus("");
  }

  async function copyResult() {
    const label = sideLabel(state);
    if (!label) return;
    try {
      await navigator.clipboard.writeText(`코인 토스 ${state.round}회: ${label}`);
      setCopyStatus(`${label} 결과를 클립보드에 복사했어요.`);
    } catch {
      setCopyStatus("복사하지 못했어요. 결과를 직접 선택해 복사해 주세요.");
    }
  }

  const label = sideLabel(state);
  const phaseCopy = state.phase === "idle"
    ? { kicker: "READY", title: "어느 면이 나올까요?", body: "코인 던지기를 눌러 시작해요." }
    : state.phase === "playing"
      ? { kicker: `ROUND ${state.round}`, title: "살랑살랑 날아가는 중", body: "잠시만 기다려 주세요." }
      : { kicker: `ROUND ${state.round} RESULT`, title: `${label}!`, body: "결과가 정해졌어요. 한 번 더 던질 수도 있어요." };

  return (
    <div className={styles.coinLayout}>
      <section className={styles.panel} aria-labelledby="coin-controls-title">
        <div className={styles.heading}>
          <div><span>CONTROLS</span><h2 id="coin-controls-title">코인 던지기</h2></div>
          <strong className={styles.count}>{state.round}회</strong>
        </div>
        <p className={styles.stageHint}>매번 브라우저의 보안 난수로 앞면 또는 뒷면을 고릅니다. 애니메이션이 멈춰도 2초 안에 결과를 자동 공개해요.</p>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.actions}>
          <button className={styles.primaryButton} type="button" onClick={start} disabled={state.phase === "playing"}>
            <Coins size={18} aria-hidden="true" /> {state.phase === "revealed" ? "한 번 더 던지기" : "코인 던지기"}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={reset} disabled={state.phase === "idle"}>
            <RotateCcw size={17} aria-hidden="true" /> 초기화
          </button>
          <button className={styles.secondaryButton} type="button" onClick={copyResult} disabled={state.phase !== "revealed"}>
            <Clipboard size={17} aria-hidden="true" /> 결과 복사
          </button>
        </div>
        <p className={styles.fieldHint} role="status" aria-live="polite">{copyStatus}</p>
      </section>

      <section className={styles.coinStage} aria-labelledby="coin-result-title">
        <div className={styles.coinVisual} aria-hidden="true">
          {state.phase === "playing" ? <video
            key={state.round}
            ref={videoRef}
            className={styles.coinVideo}
            autoPlay
            muted
            playsInline
            preload="auto"
            poster="/videos/coin-toss-breeze-source.svg"
            onEnded={reveal}
            onError={reveal}
          ><source src="/videos/coin-toss-breeze.mp4" type="video/mp4" /></video> : null}
          <div
            className={styles.coin}
            data-phase={state.phase}
            data-side={state.phase === "revealed" ? state.outcome : undefined}
          >
            {state.phase === "revealed" && state.outcome === "BACK" ? <Sparkles /> : <Coins />}
          </div>
        </div>
        <div className={styles.coinText} role="status" aria-live="polite" aria-atomic="true">
          <span>{phaseCopy.kicker}</span>
          <h2 id="coin-result-title">{phaseCopy.title}</h2>
          <p>{phaseCopy.body}</p>
        </div>
      </section>
    </div>
  );
}
