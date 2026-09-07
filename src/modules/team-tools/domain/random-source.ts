export type Uint32Source = () => number;

const UINT32_RANGE = 0x1_0000_0000;
const NON_ZERO_FALLBACK_SEED = 0x9e37_79b9;

function seedText(seed: string | number) {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new RangeError("A numeric random seed must be finite.");
    }

    return `number:${seed}`;
  }

  return `string:${seed}`;
}

function fnv1a32(value: string) {
  let hash = 0x811c_9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }

  return hash >>> 0;
}

/**
 * A small deterministic source intended for replayable UI tools and tests.
 * It is not a security primitive. Browser code can supply Web Crypto instead.
 */
export function createSeededUint32Source(seed: string | number): Uint32Source {
  let state = fnv1a32(seedText(seed)) || NON_ZERO_FALLBACK_SEED;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

export function uniformRandomIndex(maxExclusive: number, source: Uint32Source) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError("maxExclusive must be an integer between 1 and 2^32.");
  }

  const acceptanceLimit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;

  for (;;) {
    const value = source();
    if (!Number.isSafeInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new RangeError("A Uint32Source must return an integer between 0 and 2^32 - 1.");
    }

    if (value < acceptanceLimit) return value % maxExclusive;
  }
}

export function fisherYatesShuffle<T>(values: readonly T[], source: Uint32Source): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = uniformRandomIndex(index + 1, source);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  return shuffled;
}
