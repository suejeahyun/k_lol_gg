export async function withTiming<T>(label: string, work: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await work();
  } finally {
    const elapsed = Date.now() - start;
    if (elapsed >= 500) {
      console.warn(`[PERF_SLOW] ${label} ${elapsed}ms`);
    } else if (process.env.NODE_ENV !== "production") {
      console.info(`[PERF] ${label} ${elapsed}ms`);
    }
  }
}

export function makeServerTiming(label: string, startedAt: number) {
  const elapsed = Date.now() - startedAt;
  return `${label};dur=${elapsed}`;
}
