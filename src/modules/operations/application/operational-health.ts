import { recruitingOperatingDateKey } from "@/modules/recruiting/domain/operating-day";

export type OperationalStatus = "CLEAR" | "ATTENTION" | "UNVERIFIED" | "DISABLED";
export type MaintenanceObservation = Readonly<{
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  completedAt: string | null;
  realStorage: boolean;
}>;

/** Only counts, fixed states and observation times may cross the admin UI boundary. */
export type OperationalHealthSnapshot = Readonly<{
  checkedAt: string;
  statistics: Readonly<{ pending: number; failed: number; oldestPendingAt: string | null; lastConsumedAt: string | null }>;
  dailyClose: MaintenanceObservation | null;
  storage: MaintenanceObservation | null;
  riot: Readonly<{
    integrationEnabled: boolean; siteEnabled: boolean | null; apiConfigured: boolean; rsoConfigured: boolean;
    synthetic: boolean; pending: number; failed: number; oldestPendingAt: string | null; lastCompletedAt: string | null;
    apiProbe: MaintenanceObservation | null;
  }>;
  siteNotices: Readonly<{
    enabled: boolean; configured: boolean; pending: number; failed: number; expiredPending: number;
    oldestPendingAt: string | null; lastAuthenticatedAt: string | null; lastAcknowledgedAt: string | null;
  }>;
}>;

const MINUTE = 60_000;
function olderThan(timestamp: string | null, now: number, duration: number) {
  return timestamp !== null && now - Date.parse(timestamp) >= duration;
}

/** Observation thresholds; CLEAR describes stored evidence, never an external delivery guarantee. */
export function operationalHealthStatuses(snapshot: OperationalHealthSnapshot): Readonly<Record<
  "statistics" | "dailyClose" | "storage" | "riot" | "siteNotices", OperationalStatus
>> {
  const now = Date.parse(snapshot.checkedAt);
  const { statistics, dailyClose, storage, riot, siteNotices } = snapshot;
  // Allow the 06:00 KST task 15 minutes; before then evaluate the previous operating day.
  const expectedDay = recruitingOperatingDateKey(new Date(now - 15 * MINUTE));
  const dailyCloseStatus: OperationalStatus = !dailyClose ? "UNVERIFIED"
    : dailyClose.status === "FAILED" ? "ATTENTION"
    : dailyClose.status === "RUNNING" ? (olderThan(dailyClose.startedAt, now, 15 * MINUTE) ? "ATTENTION" : "UNVERIFIED")
    : recruitingOperatingDateKey(new Date(dailyClose.startedAt)) < expectedDay ? "ATTENTION" : "CLEAR";
  return {
    statistics: statistics.failed > 0 || olderThan(statistics.oldestPendingAt, now, 15 * MINUTE) ? "ATTENTION" : "CLEAR",
    dailyClose: dailyCloseStatus,
    // The storage probe is manual: an old success is an old observation, not an outage.
    storage: !storage ? "UNVERIFIED" : storage.status === "FAILED" ? "ATTENTION"
      : storage.status === "RUNNING" ? (olderThan(storage.startedAt, now, 2 * MINUTE) ? "ATTENTION" : "UNVERIFIED")
      : storage.realStorage ? "CLEAR" : "UNVERIFIED",
    riot: riot.apiProbe?.status === "FAILED" ? "ATTENTION"
      : !riot.integrationEnabled || riot.siteEnabled === false ? "DISABLED"
      : riot.siteEnabled === null || !riot.apiConfigured || riot.synthetic ? "UNVERIFIED"
      : riot.failed > 0 || olderThan(riot.oldestPendingAt, now, 30 * MINUTE) ? "ATTENTION"
      : !riot.apiProbe ? "UNVERIFIED"
      : riot.apiProbe.status === "RUNNING" ? (olderThan(riot.apiProbe.startedAt, now, 2 * MINUTE) ? "ATTENTION" : "UNVERIFIED") : "CLEAR",
    siteNotices: !siteNotices.enabled ? "DISABLED" : !siteNotices.configured ? "UNVERIFIED"
      : siteNotices.failed > 0 || siteNotices.expiredPending > 0 || olderThan(siteNotices.oldestPendingAt, now, 5 * MINUTE) ? "ATTENTION"
      : !siteNotices.lastAuthenticatedAt || olderThan(siteNotices.lastAuthenticatedAt, now, 2 * MINUTE) ? "UNVERIFIED" : "CLEAR",
  };
}
