import { RiotApplicationError } from "../application/riot-application";
import type { RiotRsoPort } from "../application/ports";

function unavailable(): never {
  throw new RiotApplicationError("FEATURE_DISABLED", "Riot account verification is not configured.");
}

/** API access never substitutes for an approved OAuth client or proof of ownership. */
export const unavailableRiotRso: RiotRsoPort = {
  issueState: unavailable,
  digestState: unavailable,
  authorizationUrl: unavailable,
  exchangeOnce: async () => unavailable(),
};
