import { MatchServiceError } from "../domain/match";

type Waiter = {
  settled: boolean;
  timer: ReturnType<typeof setTimeout>;
  resolve: (release: () => void) => void;
  reject: (error: MatchServiceError) => void;
};

/**
 * Bounds full image decoding and OCR work per Node process. Durable account and
 * network limits are enforced in PostgreSQL first; this gate protects process
 * memory/CPU from several otherwise-valid accounts arriving at once.
 */
export class MatchImageWorkGate {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly maximumActive = 2,
    private readonly maximumQueued = 6,
    private readonly queueTimeoutMs = 5_000,
  ) {
    if (maximumActive < 1 || maximumQueued < 0 || queueTimeoutMs < 1) {
      throw new Error("MATCH_IMAGE_WORK_GATE_CONFIGURATION_INVALID");
    }
  }

  private lease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.releaseOne();
    };
  }

  private releaseOne() {
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift();
      if (!waiter || waiter.settled) continue;
      waiter.settled = true;
      clearTimeout(waiter.timer);
      waiter.resolve(this.lease());
      return;
    }
    this.active -= 1;
  }

  acquire(): Promise<() => void> {
    if (this.active < this.maximumActive) {
      this.active += 1;
      return Promise.resolve(this.lease());
    }
    if (this.waiting.filter((waiter) => !waiter.settled).length >= this.maximumQueued) {
      return Promise.reject(
        new MatchServiceError(
          "RATE_LIMITED",
          "이미지 분석 작업이 혼잡합니다. 잠시 후 다시 시도해 주세요.",
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        settled: false,
        timer: setTimeout(() => {
          if (waiter.settled) return;
          waiter.settled = true;
          reject(
            new MatchServiceError(
              "RATE_LIMITED",
              "이미지 분석 대기 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
            ),
          );
        }, this.queueTimeoutMs),
        resolve,
        reject,
      };
      this.waiting.push(waiter);
    });
  }

  snapshot() {
    return {
      active: this.active,
      queued: this.waiting.filter((waiter) => !waiter.settled).length,
    } as const;
  }
}

declare global {
  var __klolV2MatchImageWorkGate: MatchImageWorkGate | undefined;
}

export function getMatchImageWorkGate() {
  if (!globalThis.__klolV2MatchImageWorkGate) {
    globalThis.__klolV2MatchImageWorkGate = new MatchImageWorkGate();
  }
  return globalThis.__klolV2MatchImageWorkGate;
}
