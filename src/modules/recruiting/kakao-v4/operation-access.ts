import type { KakaoFeature } from "../kakao-admin/domain";
import type { KakaoV4CommandClassification } from "./classifier";

/** Mirrors the legacy endpoint gates; local guidance still observes the global switch. */
export function kakaoV4OperationFeature(command: KakaoV4CommandClassification): KakaoFeature | null {
  if (command.kind === "UNKNOWN") return command.partyForm ? "recruitingEnabled" : null;
  switch (command.family) {
    case "PARTY":
    case "SCRIM": return "recruitingEnabled";
    case "INHOUSE": return "seasonApplicationsEnabled";
    case "PLAYER": return "playerSearchEnabled";
    case "OPERATIONS":
      if (command.command === "OPERATIONS_SCHEDULE_NOTICE") return "scheduledNoticeEnabled";
      if (command.command === "OPERATIONS_PHOTO_STATUS" || command.command === "OPERATIONS_PHOTO_CANCEL") return "imageReceiveEnabled";
      if (command.command === "OPERATIONS_INHOUSE_PREVIEW_CANCEL" || command.command === "OPERATIONS_INHOUSE_CONFIRM") return "seasonApplicationsEnabled";
      return "recruitingEnabled";
    case "LOCAL": return null;
  }
}
