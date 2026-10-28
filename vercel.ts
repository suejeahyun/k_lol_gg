// Managed communities retain their own aggregation and retention jobs. External Riot/Kakao jobs require separate integration.
export const config = {
  ...(["community", "hub"].includes(process.env.NEXT_PUBLIC_SERVICE_ID ?? "") ? { regions: ["sin1"] } : {}),
  "ignoreCommand": "node scripts/releases/ignore-docs-only-deployment.mjs",
  "crons": process.env.NEXT_PUBLIC_SERVICE_ID === "community" ? [
    { path: "/api/cron/destruction-ratings", schedule: "* * * * *" },
    { path: "/api/cron/statistics-projection", schedule: "*/5 * * * *" },
    { path: "/api/cron/mmr-projection", schedule: "*/5 * * * *" },
    { path: "/api/cron/support-retention", schedule: "0 19 * * *" },
    { path: "/api/cron/security-maintenance", schedule: "30 19 * * *" },
  ] : process.env.NEXT_PUBLIC_SERVICE_ID === "hub" ? [{ path: "/api/cron/community-sites", schedule: "* * * * *" }] : [
    {
      "path": "/api/cron/destruction-ratings",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/statistics-projection",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/mmr-projection",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/kakao-daily-close",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/riot-sync",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/support-retention",
      "schedule": "0 19 * * *"
    },
    {
      "path": "/api/cron/security-maintenance",
      "schedule": "30 19 * * *"
    }
  ]
};
