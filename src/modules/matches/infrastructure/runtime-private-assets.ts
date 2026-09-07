import "server-only";

import type { PrivateImageStorage, ScoreboardOcr } from "../application/ports/private-image-storage";
import { FakePrivateImageStorage, FakeScoreboardOcr, fakePrivateAdaptersAllowed } from "./private-image";

type RuntimePrivateAdapters = Readonly<{
  storage: PrivateImageStorage;
  ocr: ScoreboardOcr;
}>;

declare global {
  var __klolV2FakeMatchPrivateAdapters: RuntimePrivateAdapters | undefined;
}

export function getRuntimePrivateAdapters(): RuntimePrivateAdapters | null {
  if (!fakePrivateAdaptersAllowed()) return null;
  if (!globalThis.__klolV2FakeMatchPrivateAdapters) {
    globalThis.__klolV2FakeMatchPrivateAdapters = {
      storage: new FakePrivateImageStorage(),
      ocr: new FakeScoreboardOcr(),
    };
  }
  return globalThis.__klolV2FakeMatchPrivateAdapters;
}
