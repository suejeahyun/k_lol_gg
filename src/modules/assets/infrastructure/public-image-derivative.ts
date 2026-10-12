import sharp from "sharp";
import { createHash } from "node:crypto";

const cache = new Map<string, { bytes: Buffer; expiresAt: number }>();
const inFlight = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
const MAX_CACHE_BYTES = 32 * 1_024 * 1_024;
let activeDecoders = 0;
const decoderWaiters = new Set<() => void>();

function acquireDecoder(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;
    const grant = () => {
      if (timer) clearTimeout(timer);
      activeDecoders += 1;
      resolve(() => {
        activeDecoders -= 1;
        const next = decoderWaiters.values().next().value;
        if (next) { decoderWaiters.delete(next); next(); }
      });
    };
    if (activeDecoders < 4) { grant(); return; }
    if (decoderWaiters.size >= 16) { reject(new Error("PUBLIC_IMAGE_BUSY")); return; }
    decoderWaiters.add(grant);
    timer = setTimeout(() => { decoderWaiters.delete(grant); reject(new Error("PUBLIC_IMAGE_BUSY")); }, 5_000);
  });
}

async function render(bytes: Uint8Array) {
  const release = await acquireDecoder();
  try {
    const output = await sharp(bytes, { failOn: "error", limitInputPixels: 16_777_216, sequentialRead: true })
      .rotate().webp({ quality: 85 }).timeout({ seconds: 5 }).toBuffer();
    if (output.byteLength > 8 * 1_024 * 1_024) throw new Error("PUBLIC_IMAGE_TOO_LARGE");
    return output;
  } finally { release(); }
}

/** Only public delivery is re-encoded; stored evidence and its digest stay intact. */
export async function renderPublicImage(bytes: Uint8Array) {
  const key = createHash("sha256").update(bytes).digest("hex");
  const now = Date.now();
  for (const [id, entry] of cache) {
    if (entry.expiresAt <= now) { cache.delete(id); cacheBytes -= entry.bytes.byteLength; }
  }
  const cached = cache.get(key);
  if (cached) return { bytes: cached.bytes, contentType: "image/webp" as const };
  let pending = inFlight.get(key);
  if (!pending) {
    // A burst of different large images cannot allocate unlimited decoder memory.
    if (inFlight.size >= 20) throw new Error("PUBLIC_IMAGE_BUSY");
    pending = render(bytes).then((output) => {
      while (cache.size >= 64 || cacheBytes + output.byteLength > MAX_CACHE_BYTES) {
        const oldest = cache.entries().next().value;
        if (!oldest) break;
        cache.delete(oldest[0]); cacheBytes -= oldest[1].bytes.byteLength;
      }
      cache.set(key, { bytes: output, expiresAt: Date.now() + 300_000 }); cacheBytes += output.byteLength;
      return output;
    }).finally(() => { inFlight.delete(key); });
    inFlight.set(key, pending);
  }
  const output = await pending;
  return { bytes: output, contentType: "image/webp" as const };
}
